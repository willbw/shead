# Shithead

Multiplayer card game played in the browser over Socket.IO.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+

## Setup

```bash
pnpm install
pnpm build
```

## Running

```bash
pnpm dev
```

This starts both the server (`http://localhost:3001`) and the client (`http://localhost:5173`).

## How to Play

1. Open `http://localhost:5173` in two or more browser tabs
2. Enter a name in each tab and click **Set**
3. In one tab, click **Create Game**
4. Copy the room code and paste it into the other tab(s), then click **Join**
5. Click **Start Game** once everyone has joined (minimum 2 players)

### Swap Phase

Arrange your starting cards by tapping a hand card then a face-up card to swap them. Click **Ready** when done.

### Play Phase

On your turn, tap one or more cards of the same rank to select them, then click **Play**. If you can't play, click **Pick Up Pile**. When playing from face-down cards, tap one to play it blind.

### Winning

The first player to get rid of all their cards (hand, face-up, and face-down) escapes. The last player remaining is the Shithead.

## Project Structure

```
apps/
  client/    SvelteKit frontend (Svelte 5, Tailwind v4)
  server/    Node.js backend (Hono, Socket.IO)
packages/
  shared/       Shared types (Card, Player, socket events)
  game_engine/  Generic game room framework
  games/        Game implementations (Shithead)
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start client and server in dev mode |
| `pnpm build` | Build all packages |
| `pnpm check` | Type-check all packages |
| `pnpm test` | Run tests |
| `pnpm format` | Format with Prettier |

## Deploy

On the DigitalOcean droplet:

```bash
cd /path/to/shead
git pull
docker build -t shead .
docker stop shead && docker rm shead
docker run -d --name shead -p 3001:3001 --restart unless-stopped shead
sudo systemctl reload caddy
```
