const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Salas ficam armazenadas na memória
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

// Verificação de saúde do servidor
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    rooms: rooms.size
  });
});

// Limpa e limita o nome do jogador
function cleanName(name) {
  return String(name || "Jogador")
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, 20) || "Jogador";
}

// Limpa o código da sala
function cleanRoom(room) {
  return String(room || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

// Cria um código aleatório de 5 caracteres
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

// Cria uma nova partida
function newGame() {
  return {
    board: Array(9).fill(null),
    turn: "X",
    winner: null,
    draw: false
  };
}

// Verifica vitória ou empate
function result(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  for (const [a, b, c] of lines) {
    if (
      board[a] &&
      board[a] === board[b] &&
      board[a] === board[c]
    ) {
      return {
        winner: board[a],
        line: [a, b, c],
        draw: false
      };
    }
  }

  if (board.every(Boolean)) {
    return {
      winner: null,
      line: [],
      draw: true
    };
  }

  return {
    winner: null,
    line: [],
    draw: false
  };
}

// Estado que será enviado aos jogadores
function publicState(room) {
  return {
    code: room.code,

    board: room.board,

    turn: room.turn,

    winner: room.winner,

    draw: room.draw,

    winningLine: room.winningLine || [],

    players: {
      X: room.players.X
        ? room.players.X.name
        : null,

      O: room.players.O
        ? room.players.O.name
        : null
    },

    connected: {
      X: !!room.players.X,
      O: !!room.players.O
    },

    scores: {
      X: room.scores.X,
      O: room.scores.O,
      draws: room.scores.draws
    }
  };
}

// Envia o estado atualizado para toda a sala
function emitRoom(room) {
  io.to(room.code).emit(
    "state",
    publicState(room)
  );
}

// Quando alguém entra no servidor
io.on("connection", (socket) => {

  // =========================
  // CRIAR SALA
  // =========================

  socket.on("createRoom", ({ name } = {}, callback) => {
    const code = makeRoomCode();

    const game = newGame();

    const room = {
      code: code,

      board: game.board,

      turn: game.turn,

      winner: null,

      draw: false,

      winningLine: [],

      players: {
        X: {
          id: socket.id,
          name: cleanName(name)
        },

        O: null
      },

      scores: {
        X: 0,
        O: 0,
        draws: 0
      }
    };

    rooms.set(code, room);

    socket.join(code);

    socket.data.room = code;
    socket.data.symbol = "X";

    callback?.({
      ok: true,
      code: code,
      symbol: "X"
    });

    emitRoom(room);
  });


  // =========================
  // ENTRAR EM UMA SALA
  // =========================

  socket.on("joinRoom", ({ name, code } = {}, callback) => {

    const roomCode = cleanRoom(code);

    const room = rooms.get(roomCode);

    if (!room) {
      callback?.({
        ok: false,
        error: "Sala não encontrada."
      });

      return;
    }

    if (room.players.X && room.players.O) {
      callback?.({
        ok: false,
        error: "Essa sala já está cheia."
      });

      return;
    }

    room.players.O = {
      id: socket.id,
      name: cleanName(name)
    };

    socket.join(roomCode);

    socket.data.room = roomCode;
    socket.data.symbol = "O";

    callback?.({
      ok: true,
      code: roomCode,
      symbol: "O"
    });

    emitRoom(room);
  });


  // =========================
  // FAZER JOGADA
  // =========================

  socket.on("move", ({ index } = {}, callback) => {

    const roomCode = socket.data.room;

    const symbol = socket.data.symbol;

    const room = rooms.get(roomCode);

    if (!room) {
      callback?.({
        ok: false,
        error: "Sala não encontrada."
      });

      return;
    }

    if (!room.players.X || !room.players.O) {
      callback?.({
        ok: false,
        error: "Aguardando o segundo jogador."
      });

      return;
    }

    if (room.winner || room.draw) {
      callback?.({
        ok: false,
        error: "A partida terminou."
      });

      return;
    }

    if (symbol !== room.turn) {
      callback?.({
        ok: false,
        error: "Não é sua vez."
      });

      return;
    }

    const i = Number(index);

    if (
      !Number.isInteger(i) ||
      i < 0 ||
      i > 8 ||
      room.board[i]
    ) {
      callback?.({
        ok: false,
        error: "Jogada inválida."
      });

      return;
    }

    // Coloca X ou O no tabuleiro
    room.board[i] = symbol;

    // Verifica resultado
    const r = result(room.board);

    if (r.winner) {

      room.winner = r.winner;

      room.winningLine = r.line;

      room.scores[r.winner]++;

    } else if (r.draw) {

      room.draw = true;

      room.winningLine = [];

      room.scores.draws++;

    } else {

      // Troca a vez
      room.turn =
        symbol === "X"
          ? "O"
          : "X";

      room.winningLine = [];
    }

    callback?.({
      ok: true
    });

    emitRoom(room);
  });


  // =========================
  // REINICIAR PARTIDA
  // =========================

  socket.on("restart", (callback) => {

    const roomCode = socket.data.room;

    const room = rooms.get(roomCode);

    if (!room) {
      callback?.({
        ok: false,
        error: "Sala não encontrada."
      });

      return;
    }

    room.board = Array(9).fill(null);

    room.turn = "X";

    room.winner = null;

    room.draw = false;

    room.winningLine = [];

    callback?.({
      ok: true
    });

    emitRoom(room);
  });


  // =========================
  // ZERAR PLACAR
  // =========================

  socket.on("resetScores", (callback) => {

    const roomCode = socket.data.room;

    const room = rooms.get(roomCode);

    if (!room) {
      callback?.({
        ok: false,
        error: "Sala não encontrada."
      });

      return;
    }

    room.scores = {
      X: 0,
      O: 0,
      draws: 0
    };

    room.board = Array(9).fill(null);

    room.turn = "X";

    room.winner = null;

    room.draw = false;

    room.winningLine = [];

    callback?.({
      ok: true
    });

    emitRoom(room);
  });


  // =========================
  // JOGADOR DESCONECTOU
  // =========================

  socket.on("disconnect", () => {

    const roomCode = socket.data.room;

    const symbol = socket.data.symbol;

    const room = rooms.get(roomCode);

    if (!room) {
      return;
    }

    if (
      room.players[symbol] &&
      room.players[symbol].id === socket.id
    ) {

      const playerName =
        room.players[symbol].name;

      room.players[symbol] = null;

      io.to(roomCode).emit(
        "playerDisconnected",
        {
          symbol: symbol,
          name: playerName
        }
      );

      emitRoom(room);
    }

    // Se os dois saírem,
    // remove a sala depois de 5 minutos.
    if (
      !room.players.X &&
      !room.players.O
    ) {

      setTimeout(() => {

        const current =
          rooms.get(roomCode);

        if (
          current &&
          !current.players.X &&
          !current.players.O
        ) {
          rooms.delete(roomCode);
        }

      }, 5 * 60 * 1000);
    }
  });

});


// =========================
// INICIAR SERVIDOR
// =========================

server.listen(PORT, () => {
  console.log(
    `Velha do Fafinha rodando na porta ${PORT}`
  );
});
