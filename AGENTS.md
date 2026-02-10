# AGENTS.md — Codebase Guide for Claude Code

## Project Overview

**Shead** is a multiplayer card game platform. The first (and currently only) game is **Shithead** — a classic shedding card game where the last player with cards loses. The app uses a TypeScript monorepo with a real-time Socket.IO architecture.

## Code Style

See `STYLE.md` for full conventions. Key rules:

- **snake_case** for functions, variables, files, directories
- **Capitalized_snake_case** for types, interfaces (`Visible_shithead_state`, `Card_game_definition`)
- **UPPER_SNAKE_CASE** for constants (`SUITS`, `RANKS`, `DEFAULT_SHITHEAD_CONFIG`)
- Tabs for indentation in `.svelte` files (SvelteKit default), spaces elsewhere
- No semicolons in server/shared/engine code; Svelte files follow the same pattern

## Monorepo Structure

```
shead/
├── apps/
│   ├── client/          # SvelteKit frontend (Svelte 5, Tailwind v4)
│   └── server/          # Node.js backend (Hono HTTP + Socket.IO)
├── packages/
│   ├── shared/          # Shared types: Card, Player, socket events, Lobby_state
│   ├── game_engine/     # Generic game room framework (Card_game_definition, Game_room, Room_manager)
│   └── games/           # Game implementations (currently just Shithead)
├── turbo.json           # Turbo task config
├── pnpm-workspace.yaml  # pnpm workspaces
└── tsconfig.base.json   # Shared TS config
```

**Package manager:** pnpm (v9)
**Build orchestrator:** Turborepo
**Package build tool:** tsup (ESM, with .d.ts)

### Dependency Graph

```
@shead/shared          ← no dependencies (leaf)
@shead/game-engine     ← depends on @shead/shared
@shead/games           ← depends on @shead/shared + @shead/game-engine
@shead/server          ← depends on @shead/shared + @shead/game-engine + @shead/games
@shead/client          ← depends on @shead/shared only (game types are redefined locally)
```

## Common Commands

```bash
pnpm dev          # Start both client (:5173) and server (:3001) in parallel
pnpm build        # Build all packages (turbo, respects dependency order)
pnpm check        # Type-check all packages (svelte-check for client, tsc for others)
pnpm test         # Run tests (vitest) across packages
pnpm format       # Format with prettier
```

Per-package commands work too: `cd apps/client && pnpm check`

## Architecture

### Data Flow

```
Browser (SvelteKit)  ←Socket.IO→  Server (Hono + Socket.IO)
       ↕                                    ↕
  Svelte 5 stores                    Room_manager
  ($state runes)                         ↕
                                    Game_room<T>
                                         ↕
                                  Card_game_definition
                                  (shithead_definition)
```

1. Client connects via socket.io-client to `localhost:3001`
2. Server creates a `Connected_player` keyed by `socket.id` (which is also the `player_id`)
3. Client sends events (`player:set_name`, `lobby:create`, `lobby:join`, `lobby:start`, `game:command`) — all use ack callbacks
4. Server validates commands via `Card_game_definition.validate_command()`, applies via `apply_command()`
5. Server broadcasts per-player visible state via `game:state` event (hides other players' hands/face-down cards)
6. Client stores receive updates and Svelte reactivity re-renders the UI

### Socket Events

**Client → Server** (all have ack callbacks):
| Event | Payload | Ack |
|-------|---------|-----|
| `player:set_name` | `name: string` | `{ ok: true } \| { ok: false; reason }` |
| `lobby:create` | `{ game_type, max_players }` | `{ ok: true; room: Lobby_state } \| { ok: false; reason }` |
| `lobby:join` | `room_id: string` | `{ ok: true; room: Lobby_state } \| { ok: false; reason }` |
| `lobby:leave` | *(none)* | `{ ok: true } \| { ok: false; reason }` |
| `lobby:list` | *(none)* | `Lobby_state[]` |
| `lobby:start` | *(none)* | `{ ok: true } \| { ok: false; reason }` |
| `game:command` | `Base_command & Record<string, unknown>` | `Validation_result` |

**Server → Client** (broadcast, no ack):
| Event | Payload |
|-------|---------|
| `game:state` | `unknown` (actually `Visible_shithead_state`) |
| `game:error` | `{ message: string }` |
| `game:over` | `Record<string, number>` (scores) |
| `lobby:update` | `Lobby_state` |
| `lobby:rooms` | `Lobby_state[]` |

### Game Engine Framework

`Card_game_definition<T_state, T_command, T_config>` is the interface for any card game:
- `initial_state(config, players)` → creates starting state
- `validate_command(state, cmd)` → returns `{ valid: true }` or `{ valid: false; reason }`
- `apply_command(state, cmd)` → returns new state (immutable — always clones)
- `get_visible_state(state, player_id)` → player-specific view (hides private info)
- `is_game_over(state)` → boolean
- `get_scores(state)` → `Map<string, number>`

`Game_room` wraps a definition with player management, status tracking (`waiting` → `in_progress` → `finished`), and event emission.

`Room_manager` manages multiple rooms, generates room IDs (`room-1`, `room-2`, ...), and routes operations.

### Shithead Game Rules

**Phases:** `swap` → `play` → `finished`

**Setup:** Each player gets 3 face-down (hidden), 3 face-up (visible), 3 hand cards from a standard 52-card deck.

**Swap phase:** Players swap cards between hand and face-up, then send `READY`. Once all ready, transitions to `play`.

**Play phase:** Players take turns. Must play from hand first, then face-up, then face-down (blind).

**Card rules:**
- Must play equal or higher rank than pile top
- **2**: Always playable (resets pile)
- **7**: Next player must play ≤7
- **10**: Always playable, burns (clears) the pile — player gets another turn
- **4-of-a-kind on pile**: Burns the pile — player gets another turn
- **Face-down**: Blind play, one at a time. If it can't be played, player picks up pile + the card.

**Winning:** First player to empty all three card areas (hand, face-up, face-down) exits. Last player remaining is the "shithead" (score 0, everyone else scores 1).

**Commands:**
- `{ type: 'SWAP_CARD', hand_card_id, face_up_card_id }` — swap phase only
- `{ type: 'READY' }` — swap phase only
- `{ type: 'PLAY_CARD', card_ids: string[] }` — play phase, your turn
- `{ type: 'PICK_UP_PILE' }` — play phase, your turn

All commands include `player_id` (injected server-side from socket identity).

## Key Types

### Shared (`@shead/shared`)

```typescript
interface Card { suit: Suit; rank: Rank; id: string }
// Suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'
// Rank: '2'–'10' | 'J' | 'Q' | 'K' | 'A'
// Card IDs follow the pattern: `${suit}-${rank}` (e.g., "hearts-A")

interface Player { id: string; name: string; connected: boolean }
interface Lobby_state { room_id: string; players: Player[]; game_type: string; status: 'waiting' | 'in_progress' | 'finished' }
type Base_command = { player_id: string }
type Validation_result = { valid: true } | { valid: false; reason: string }
```

### Game State (`@shead/games` — also redefined in client)

```typescript
interface Visible_shithead_state {
  discard_pile: Card[]
  deck_count: number
  players: Record<string, Visible_player_state>  // opponents only
  own_state: Visible_own_player_state
  current_player: string  // player_id of whose turn it is
  phase: 'swap' | 'play' | 'finished'
  player_order: string[]
  last_effect: 'burn' | 'reverse' | null
}

interface Visible_player_state {       // what you see of opponents
  hand_count: number; face_up: Card[]; face_down_count: number
}

interface Visible_own_player_state {   // what you see of yourself
  hand: Card[]; face_up: Card[]; face_down_count: number
}
```

Note: The client does NOT depend on `@shead/games`. The `Visible_shithead_state` types are duplicated in `apps/client/src/lib/stores/game.svelte.ts`. If you change the shape in the game engine, update the client copy too.

## Client Architecture (SvelteKit + Svelte 5)

### Stores (Svelte 5 `$state` runes)

```
src/lib/stores/
├── connection.svelte.ts  # { connected, player_id, player_name }
├── lobby.svelte.ts       # { room: Lobby_state | null, rooms: Lobby_state[] }
└── game.svelte.ts        # { game_state, selected_card_ids, error_message, scores }
```

Stores are plain `$state` objects exported as singletons. Import and mutate directly — Svelte 5 reactivity tracks it.

### Socket Layer

`src/lib/socket.ts` creates a typed `socket.io-client` instance and:
- Wires all server events to store updates
- Exports promise-based helpers (`set_name()`, `create_room()`, `join_room()`, etc.)
- Connects to `http://localhost:3001`

### Components

```
src/lib/components/
├── card.svelte          # Single card face (suit symbol + rank, red/black, selected state)
├── card_back.svelte     # Face-down card (blue pattern)
├── player_hand.svelte   # Player's cards — adapts to swap vs play phase
├── opponent_zone.svelte # Opponent display (face-up, hand count, face-down count)
└── game_status.svelte   # Turn indicator, phase label, last effect, error message
```

### Pages

```
src/routes/
├── +layout.svelte       # Root layout (favicon + CSS import)
├── +page.svelte         # Home: set name, create/join room, room list
└── game/
    └── +page.svelte     # Game table: waiting room → swap → play → finished
```

The game page has 5 conditional states: redirect (no room), waiting room, swap phase, play phase, game over.

### Styling

Tailwind CSS v4 via `@tailwindcss/vite` plugin. All styling is utility classes in templates. The game table uses a green (`bg-green-900`) theme. Cards are white with colored suit text.

## Server Architecture

`apps/server/src/index.ts` — Entry point. Hono HTTP server on port 3001 with CORS. Registers `shithead_definition` with `Room_manager`. Attaches Socket.IO.

`apps/server/src/socket.ts` — Socket.IO event handlers. Tracks `Connected_player` by `socket.id`. On disconnect during `waiting`: removes player. On disconnect during `in_progress`: marks as disconnected (player stays in game). Rooms auto-destroy 60s after game over.

## Adding a New Game

1. Create `packages/games/src/your_game/types.ts` with state, command, config, and visible state types
2. Create `packages/games/src/your_game/definition.ts` implementing `Card_game_definition`
3. Export from `packages/games/src/your_game/index.ts` and `packages/games/src/index.ts`
4. Register in `apps/server/src/index.ts`: `room_manager.register_game(your_definition)`
5. Add visible state types to the client and update `game/+page.svelte` to handle the new game's UI

## Testing

Tests use **vitest**. Currently `packages/games/src/shithead/definition.test.ts` tests game logic.

Run: `pnpm test` (all) or `cd packages/games && pnpm test` (specific package).

## Common Pitfalls

- **State is immutable in the game engine.** `apply_command` always clones before mutating. Never mutate in place.
- **`game:state` event payload is typed as `unknown`.** The server's `get_visible_state` returns `unknown`. The client casts it to `Visible_shithead_state`.
- **`player_id` is `socket.id`.** The server overwrites `cmd.player_id` with the socket's actual player ID before processing — clients can't impersonate other players.
- **The client's `Visible_shithead_state` is a copy** of the type from `@shead/games`. Keep them in sync manually.
- **Build order matters.** Shared packages must build before dependents. `turbo build` handles this via `dependsOn: ["^build"]`. For `pnpm dev`, shared packages are built first, then apps start in dev/watch mode.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`) are used instead of Svelte 4 stores. The `.svelte.ts` extension is required for files using runes outside of components.
