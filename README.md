# 🎮 Velha do Fafinha Online

Jogo da Velha multiplayer em tempo real usando **Node.js + Express + Socket.IO**.

## Estrutura

```text
velha-do-fafinha/
├── package.json
├── server.js
├── README.md
└── public/
    └── index.html
```

## Rodar no computador

Você precisa ter Node.js 18 ou superior.

```bash
npm install
npm start
```

Depois abra:

```text
http://localhost:3000
```

## Como jogar online

O GitHub é usado para guardar o código. Para o jogo funcionar pela internet, o projeto precisa ser publicado em um serviço que execute Node.js.

Depois de publicar:

1. Abra o endereço do jogo.
2. Digite seu nome.
3. Toque em **Criar uma sala**.
4. Copie o código de 5 caracteres.
5. Envie o código para seu amigo.
6. Seu amigo abre o mesmo endereço, coloca o nome e digita o código.
7. A partida começa em tempo real.

## Recursos

- Salas privadas com código.
- Dois jogadores por sala.
- X e O definidos automaticamente.
- Jogadas sincronizadas em tempo real.
- Detecção de vitória e empate.
- Reinício de partida.
- Placar de vitórias e empates.
- Interface responsiva para celular.
- Endpoint `/health` para verificar o servidor.

## Observação importante

Este projeto não usa Firebase. O estado das salas fica na memória do processo Node.js. Se o servidor for reiniciado, as salas e placares existentes serão perdidos.

Para uma primeira versão simples e gratuita, isso é suficiente. Depois podemos adicionar banco de dados, contas de jogadores, histórico de partidas e outras funções.
