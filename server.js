const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

function cleanName(name) {
  return String(name || "Jogador")
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, 20) || "Jogador";
}

function cleanRoom(room) {
  return String(room || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function newGame() {
  return {
    board: Array(9).fill(null),
    turn: "X",
    winner: null,
    draw: false
  };
}

function result(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a,b,c] };
    }
  }

  if (board.every(Boolean)) return { winner: null, draw: true };
  return { winner: null, draw: false };
}

function publicState(room) {
  return {
    code: room.code,
    board: room.board,
    turn: room.turn,
    winner: room.winner,
    draw: room.draw,
    players: {
      X: room.players.X ? room.players.X.name : null,
      O: room.players.O ? room.players.O.name : null
    },
    connected: {
      X: !!room.players.X,
      O: !!room.players.O
    },
    scores: room.scores
  };
}

function emitRoom(room) {
  io.to(room.code).emit("state", publicState(room));
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name } = {}, callback) => {
    const code = makeRoomCode();

    const room = {
      code,
      board: newGame().board,
      turn: "X",
      winner: null,
      draw: false,
      players: { X: { id: socket.id, name: cleanName(name) }, O: null },
      scores: { X: 0, O: 0, draws: 0 }
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.room = code;
    socket.data.symbol = "X";

    callback?.({ ok: true, code, symbol: "X" });
    emitRoom(room);
  });

  socket.on("joinRoom", ({ name, code } = {}, callback) => {
    const roomCode = cleanRoom(code);
    const room = rooms.get(roomCode);

    if (!room) {
      callback?.({ ok: false, error: "Sala não encontrada." });
      return;
    }

    i    let symbol;

    if (!room.players.X) {
      symbol = "X";
      room.players.X = {
        id: socket.id,
        name: cleanName(name)
      };
    } else if (!room.players.O) {
      symbol = "O";
      room.players.O = {
        id: socket.id,
        name: cleanName(name)
      };
    } else {
      callback?.({
        ok: false,
        error: "Essa sala já está cheia."
      });
      return;
    }

    socket.join(roomCode);
    socket.data.room = roomCode;
    socket.data.symbol = symbol;

    callback?.({
      ok: true,
      code: roomCode,
      symbol
    });

    emitRoom(room);
  });

  socket.on("move", ({ index } = {}, callback) => {
    const roomCode = socket.data.room;
    const symbol = socket.data.symbol;
    const room = rooms.get(roomCode);

    if (!room) return callback?.({ ok: false, error: "Sala não encontrada." });
    if (!room.players.X || !room.players.O) {
      return callback?.({ ok: false, error: "Aguardando o segundo jogador." });
    }
    if (room.winner || room.draw) {
      return callback?.({ ok: false, error: "A partida terminou." });
    }
    if (symbol !== room.turn) {
      return callback?.({ ok: false, error: "Não é sua vez." });
    }

    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i > 8 || room.board[i]) {
      return callback?.({ ok: false, error: "Jogada inválida." });
    }

    room.board[i] = symbol;

    const r = result(room.board);
    if (r.winner) {
      room.winner = r.winner;
      room.scores[r.winner]++;
    } else if (r.draw) {
      room.draw = true;
      room.scores.draws++;
    } else {
      room.turn = symbol === "X" ? "O" : "X";
    }

    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("restart", (callback) => {
    const room = rooms.get(socket.data.room);
    if (!room) return callback?.({ ok: false, error: "Sala não encontrada." });

    room.board = Array(9).fill(null);
    room.turn = "X";
    room.winner = null;
    room.draw = false;

    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("resetScores", (callback) => {
    const room = rooms.get(socket.data.room);
    if (!room) return callback?.({ ok: false, error: "Sala não encontrada." });

    room.scores = { X: 0, O: 0, draws: 0 };
    room.board = Array(9).fill(null);
    room.turn = "X";
    room.winner = null;
    room.draw = false;

    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.room;
    const symbol = socket.data.symbol;
    const room = rooms.get(roomCode);
    if (!room) return;

    // Mantém a sala por alguns minutos para permitir reconexões.
    if (room.players[symbol]?.id === socket.id) {
      room.players[symbol] = null;
      io.to(roomCode).emit("playerDisconnected", {
        symbol,
        name: symbol === "X" ? "Jogador X" : "Jogador O"
      });
      emitRoom(room);
    }

    if (!room.players.X && !room.players.O) {
      setTimeout(() => {
        const current = rooms.get(roomCode);
        if (current && !current.players.X && !current.players.O) {
          rooms.delete(roomCode);
        }
      }, 5 * 60 * 1000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Velha do Fafinha rodando na porta ${PORT}`);
});
