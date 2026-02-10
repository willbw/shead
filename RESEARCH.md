# RESEARCH.md — Multiplayer Card Game Platform

Research into the best tech stack and architecture for a browser-based, server-authoritative multiplayer card game platform.

## Requirements

- Strongly typed, modern, well-supported tech stack
- Server-authoritative game state (prevents cheating — server validates all moves)
- Real-time multiplayer for 2-5 players
- In-memory state (no database for now)
- Generic engine supporting multiple card games (500, Shithead, etc.)
- Mobile-friendly responsive UI
- Maximum code sharing between frontend and backend

---

## 1. Language/Runtime: TypeScript

**TypeScript end-to-end is the clear winner.** No other option allows full code sharing between client and server while remaining strongly typed.

Alternatives considered and rejected:
- **Rust/WASM + TS frontend** — massive complexity for no benefit in a card game; loses seamless code sharing
- **Dart/Flutter Web** — poor web ecosystem for real-time multiplayer
- **Elixir/Phoenix** — excellent for real-time but requires duplicating all validation logic (no code sharing with frontend)

---

## 2. Frontend Framework

### React
- Largest ecosystem, most tutorials, easiest hiring
- Framer Motion provides excellent card animations and drag-and-drop
- Existing card game UI prior art
- Larger bundle (~42 kB compressed), virtual DOM overhead needs careful optimization

### Svelte 5
- Built-in animation primitives (`animate:flip`, `transition:`) — ideal for card movement animations
- Tiny bundle (~1.6 kB) — great for mobile
- `svelte-dnd-action` provides mature drag-and-drop with FLIP animations
- Smaller ecosystem, fewer developers, Svelte 5 runes are newer

### SolidJS
- Fastest raw performance (fine-grained reactivity, no VDOM)
- Smallest ecosystem, limited animation support, riskier long-term bet

**Recommendation: Svelte 5 with SvelteKit** for this project. The built-in animation system is practically made for card games (moving cards between hands/piles with smooth transitions), and the tiny bundle size is ideal for mobile. React is the safer choice if hiring/team size is a concern.

---

## 3. Real-time Communication

### Socket.IO
- Built-in room management (perfect for game lobbies/tables)
- Automatic reconnection with exponential backoff (critical for mobile)
- Fallback to HTTP long-polling when WebSocket fails
- Event-based API with named events, built-in acknowledgements
- ~30% slower than raw WebSocket (irrelevant for turn-based card games)

### Raw `ws` library
- Minimal overhead, lowest latency
- No rooms, reconnection, or fallback — must build everything yourself

### Colyseus (Multiplayer Framework)
- Complete solution: rooms, matchmaking, state sync, reconnection
- Server-authoritative by design with automatic delta-compressed state sync
- TypeScript-native, MIT licensed
- Opinionated state model (`@colyseus/schema` decorators), tighter coupling

### boardgame.io (Turn-Based Game Framework)
- Purpose-built for turn-based games
- Built-in secret state handling (hides opponent cards automatically)
- Turn order management, game phases, automatic move validation
- Built-in AI/bot framework and debug/replay tools
- Never reached 1.0 (v0.50.x), more opinionated, less suitable for simultaneous play elements

**Recommendation: Socket.IO with custom game logic.** It provides rooms, reconnection, and events out of the box while giving full freedom over game engine architecture. boardgame.io is worth considering if all games are strictly turn-based, but its opinions may become constraints across varied card games.

---

## 4. Backend Framework

### Hono
- Runs on any JS runtime (Node.js, Bun, Deno, Cloudflare Workers)
- Tiny, excellent TypeScript types, Web Standards based (Fetch API)
- Smaller community, fewer resources

### Fastify
- ~40k req/sec, mature plugin ecosystem, schema-based validation
- Easy Socket.IO integration via `fastify-socket.io`
- Node.js only

### Express
- Most tutorials, largest middleware ecosystem
- Slowest, aging architecture, less TypeScript-friendly

**Recommendation: Hono.** The HTTP framework is minimal for this project — it serves the initial page and upgrades to WebSocket. Hono's lightweight nature and multi-runtime support (future-proofing for Bun) make it ideal. Fastify is the safe alternative if a richer plugin ecosystem is needed.

---

## 5. Monorepo & Shared Code

### pnpm Workspaces + Turborepo
- pnpm: fastest package manager, efficient disk usage (content-addressable storage)
- Turborepo: intelligent build caching, lightweight task runner
- Simple mental model, well-documented for TypeScript monorepos

### Nx
- Most feature-rich (generators, dependency graph, distributed caching)
- Overkill for a small project with 3-5 packages, steeper learning curve

### pnpm Workspaces alone
- Simplest setup, zero additional tooling
- No build caching or task orchestration

**Recommendation: pnpm workspaces + Turborepo.** Right-sized for 3-5 packages.

---

## 6. Game Architecture

### State Machine for Game Flow
Card games are inherently state machines with phases (dealing, bidding, playing, scoring) and turn management within each phase. A **custom lightweight state machine** is preferred over XState — XState excels at UI state but feels heavyweight for pure game logic.

### Command Pattern for Moves
The standard approach for card game actions:

```typescript
// Shared types (packages/shared)
type GameCommand =
  | { type: 'PLAY_CARD'; playerId: string; cardId: string }
  | { type: 'DRAW_CARD'; playerId: string }
  | { type: 'BID'; playerId: string; bid: Bid }
  | { type: 'PASS'; playerId: string }

// Shared validation
function validateCommand(state: GameState, cmd: GameCommand): ValidationResult

// Server applies command, produces new state
function applyCommand(state: GameState, cmd: GameCommand): GameState
```

Benefits: undo/redo, replay, shared validation between client and server, scriptable test scenarios.

### Generic Card Game Engine (Plugin Pattern)

```typescript
interface CardGameDefinition<TState, TCommand, TConfig> {
  initialState(config: TConfig, players: Player[]): TState
  validateCommand(state: TState, cmd: TCommand): ValidationResult
  applyCommand(state: TState, cmd: TCommand): TState
  getVisibleState(state: TState, playerId: string): Partial<TState>  // Hide cards!
  isGameOver(state: TState): boolean
  getWinner(state: TState): Player | null
}
```

`getVisibleState()` is critical — the server holds all truth (all hands, deck order) but each client only receives what they're allowed to see. This prevents cheating at the architecture level.

### Transmit Intent, Not State
Send compact action commands rather than full state snapshots. The server confirms or corrects. Important for mobile bandwidth.

---

## 7. Styling & Mobile

**Tailwind CSS** — responsive mobile-first design, works with any framework, utility classes are efficient for card layouts. Card rendering uses CSS transforms for fan/hand layouts, CSS Grid or Flexbox for table areas.

---

## Recommended Stack Summary

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Language** | TypeScript | Max code sharing, strong typing, single language |
| **Monorepo** | pnpm + Turborepo | Lightweight, fast caching, right-sized |
| **Frontend** | Svelte 5 + SvelteKit | Built-in animations, tiny bundle, mobile-first |
| **Animations** | Built-in Svelte transitions | `animate:flip`, `transition:`, `svelte-dnd-action` |
| **Styling** | Tailwind CSS | Responsive mobile-first |
| **Backend HTTP** | Hono | Lightweight, excellent TS types, multi-runtime |
| **Real-time** | Socket.IO | Rooms, reconnection, acknowledgements |
| **Game Engine** | Custom (command + state machine) | Generic `CardGameDefinition` in shared package |
| **State** | In-memory Maps on server | Game state in room instances, no DB needed |
| **Build** | Vite (frontend) + tsx/tsup (backend) | Fast dev, efficient bundling |

## Proposed Project Structure

```
apps/
  client/          # SvelteKit app
  server/          # Hono + Socket.IO game server
packages/
  game-engine/     # Generic card game engine (state machine, command pattern)
  games/           # Game definitions (500, Shithead, etc.)
  shared/          # Common types, card deck utilities, validation helpers
```

## Key Architectural Decisions

1. **Server-authoritative** — all game state lives on the server. Clients send commands; server validates, applies, and broadcasts visible state.
2. **Hidden information** — `getVisibleState()` per player ensures no client ever receives cards they shouldn't see.
3. **Command pattern** — moves are serializable commands validated in shared code, applied on the server.
4. **Generic engine** — new card games are added by implementing `CardGameDefinition`. Networking, rooms, and UI framework stay the same.
5. **In-memory state** — game rooms hold state in memory. When the game ends, the room is destroyed.

## Sources

- [Exploring Architectural Concepts Building a Card Game — InfoQ](https://www.infoq.com/articles/exploring-architecture-building-game/)
- [Building a Real-Time Multiplayer Card Game — baker.is](https://baker.is/posts/building-phucking-cards/)
- [cards-ts: Card Game Framework in TypeScript](https://github.com/johnameyer/cards-ts)
- [Colyseus — Multiplayer Framework for Node.js](https://colyseus.io/)
- [boardgame.io — Turn-Based Game Engine](https://boardgame.io/)
- [Choosing a tech stack for my card game platform](https://devblog.dunsap.com/posts/2022/07-10---choosing-a-tech-stack-for-my-card-game-platform/)
- [Command Pattern — Game Programming Patterns](https://gameprogrammingpatterns.com/command.html)
- [XState — State Machines and Statecharts](https://stately.ai/docs/xstate)
- [svelte-dnd-action — Drag and Drop for Svelte](https://github.com/isaacHagoel/svelte-dnd-action)
