# PLAN.md — Implementation Plan

Step-by-step plan for building the multiplayer card game platform based on RESEARCH.md.

---

## Phase 1: Monorepo Scaffold

Set up the project skeleton with all packages wired together before writing any game logic.

### 1.1 Initialize pnpm workspace
- Create `pnpm-workspace.yaml` listing `apps/*` and `packages/*`
- Create root `package.json` with shared dev dependencies (TypeScript, tsup, prettier, eslint)
- Create root `tsconfig.base.json` with strict settings, path aliases

### 1.2 Create package stubs
Each package gets a `package.json`, `tsconfig.json` (extending base), and `src/index.ts`:

```
packages/
  shared/          # Common types, card utilities
  game-engine/     # Generic engine (depends on shared)
  games/           # Game definitions (depends on game-engine, shared)
```

### 1.3 Create app stubs
```
apps/
  server/          # Hono + Socket.IO (depends on shared, game-engine, games)
  client/          # SvelteKit app (depends on shared)
```

### 1.4 Add Turborepo
- Create `turbo.json` with `build`, `dev`, `check` pipelines
- Verify `pnpm build` compiles all packages in dependency order
- Verify `pnpm dev` starts both client and server concurrently

**Done when:** `pnpm dev` starts both apps, and importing from `@shead/shared` works in both server and client.

---

## Phase 2: Shared Types & Card Utilities (`packages/shared`)

Build the foundation that everything else depends on.

### 2.1 Card primitives
```typescript
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
type Rank = '2' | '3' | ... | 'A'
interface Card { suit: Suit; rank: Rank; id: string }
```
- Standard 52-card deck factory (`createDeck()`)
- Joker support (needed for 500)
- Shuffle utility (Fisher-Yates)

### 2.2 Player types
```typescript
interface Player {
  id: string
  name: string
  connected: boolean
}
```

### 2.3 Game command base types
```typescript
type BaseCommand = { playerId: string }
type ValidationResult = { valid: true } | { valid: false; reason: string }
```

### 2.4 Lobby/room types
```typescript
interface LobbyState {
  roomId: string
  players: Player[]
  gameType: string
  status: 'waiting' | 'in_progress' | 'finished'
}
```

### 2.5 Socket event type map
Strongly typed event names and payloads shared between client and server:
```typescript
interface ServerToClientEvents {
  'game:state': (state: VisibleGameState) => void
  'game:error': (error: { message: string }) => void
  'lobby:update': (lobby: LobbyState) => void
}
interface ClientToServerEvents {
  'game:command': (cmd: GameCommand, ack: (result: ValidationResult) => void) => void
  'lobby:create': (opts: CreateRoomOpts, ack: (room: LobbyState) => void) => void
  'lobby:join': (roomId: string, ack: (room: LobbyState) => void) => void
}
```

**Done when:** All types compile and are importable from `@shead/shared`.

---

## Phase 3: Game Engine (`packages/game-engine`)

The generic, game-agnostic engine that runs any card game.

### 3.1 CardGameDefinition interface
```typescript
interface CardGameDefinition<TState, TCommand extends BaseCommand, TConfig> {
  id: string
  name: string
  minPlayers: number
  maxPlayers: number
  initialState(config: TConfig, players: Player[]): TState
  validateCommand(state: TState, cmd: TCommand): ValidationResult
  applyCommand(state: TState, cmd: TCommand): TState
  getVisibleState(state: TState, playerId: string): unknown
  isGameOver(state: TState): boolean
  getScores(state: TState): Map<string, number>
}
```

### 3.2 GameRoom class
Manages a single game instance:
- Holds the game definition + current state
- `handleCommand(cmd)` — validates, applies, broadcasts
- `getStateForPlayer(playerId)` — calls `getVisibleState()`
- Emits events when state changes

### 3.3 RoomManager
- `createRoom(gameType, config)` → roomId
- `joinRoom(roomId, player)`
- `getRoom(roomId)` → GameRoom
- `destroyRoom(roomId)` — cleanup after game ends
- In-memory `Map<string, GameRoom>`

**Done when:** Can create a room, add players, and process commands in a unit test (no networking).

---

## Phase 4: First Game — Shithead (`packages/games`)

Shithead is simpler than 500 (no bidding/trumps/partnerships), making it ideal for the first implementation.

### 4.1 Shithead game state
```typescript
interface ShitheadState {
  deck: Card[]
  discardPile: Card[]
  players: Map<string, {
    hand: Card[]          // cards in hand (visible to owner)
    faceUp: Card[]        // 3 face-up cards (visible to all)
    faceDown: Card[]      // 3 face-down cards (hidden from all)
  }>
  currentPlayer: string
  phase: 'swap' | 'play' | 'finished'
  direction: 1 | -1
}
```

### 4.2 Shithead rules
- Implement `ShitheadDefinition` satisfying `CardGameDefinition`
- Commands: `PLAY_CARD`, `DRAW_CARD`, `PICK_UP_PILE`, `SWAP_CARD` (pre-game), `READY`
- Card effects: 2 (reset), 7 (next plays ≤7), 10 (burn pile)
- Validate legal plays (must play equal or higher, or pick up)
- `getVisibleState()` hides other players' hands and all face-down cards

### 4.3 Unit tests
- Test full game flows: dealing, swapping phase, playing, winning
- Test invalid moves are rejected
- Test `getVisibleState()` correctly hides information

**Done when:** A complete game of Shithead can be played through in tests, command by command.

---

## Phase 5: Server (`apps/server`)

### 5.1 Hono HTTP server
- Health check endpoint (`GET /health`)
- Serve as the Socket.IO backend
- CORS configuration for local dev

### 5.2 Socket.IO integration
- Attach Socket.IO to the Hono server
- Use the shared event type map for type-safe events
- Room management: create/join/leave via socket events
- On `game:command`: validate via engine, apply, broadcast updated visible state to each player
- Handle disconnection/reconnection (mark player as disconnected, allow rejoin)

### 5.3 Lobby system
- List available rooms
- Create room (choose game type, set max players)
- Join room by code
- Start game when all players ready
- Destroy room when game ends or all players leave

**Done when:** Two Socket.IO clients can connect, create a room, and play a full game of Shithead via socket events.

---

## Phase 6: Client (`apps/client`)

### 6.1 SvelteKit setup
- Install Tailwind CSS
- Socket.IO client connection with auto-reconnect
- Typed socket wrapper using shared event types

### 6.2 Lobby UI
- Home screen: create game / join by code
- Waiting room: show players, ready button, start game
- Mobile-responsive layout

### 6.3 Game table UI
- Card component (renders a single card with suit/rank)
- Player hand (fan layout at bottom of screen, draggable/tappable)
- Opponent zones (show card backs / face-up cards)
- Discard pile (center)
- Deck (draw pile)
- Current turn indicator
- Game status text (whose turn, last action)

### 6.4 Card interactions
- Tap to select card, tap play area to play (mobile-friendly)
- Drag and drop as alternative (desktop)
- Svelte transitions for card movement (hand → pile, deck → hand)
- `animate:flip` for reordering within hand

### 6.5 Game flow
- Swap phase UI (select hand cards to swap with face-up)
- Play phase (play cards, pick up pile)
- End game screen (winner, scores, play again)

**Done when:** Full game of Shithead playable in the browser between 2+ players on separate tabs.

---

## Phase 7: Polish & Mobile

### 7.1 Mobile optimization
- Touch-friendly card sizes (min 44px tap targets)
- Viewport management (prevent zoom on double-tap)
- Responsive breakpoints: phone, tablet, desktop
- Test on iOS Safari and Android Chrome

### 7.2 UX polish
- Card flip animations (face-down → face-up reveal)
- Error messages (invalid move feedback with shake animation)
- Connection status indicator
- Sound effects (optional, mutable)

### 7.3 Reconnection
- Player reconnects to existing game after connection drop
- Restore full game state on reconnect
- Timeout: if disconnected > 60s, treat as forfeit

**Done when:** Smooth, playable experience on a phone over WiFi.

---

## Phase 8: Second Game — 500

Once the engine and UI framework are proven with Shithead, add 500.

### 8.1 500-specific state
- Bidding phase (6–10 tricks, suit or no-trumps, misère)
- Partnerships (2v2 in 4-player)
- Trick-taking with trump suits
- Joker handling (highest trump)
- Scoring (win contract → gain points, fail → lose)

### 8.2 500 game definition
- Implement `FiveHundredDefinition` satisfying `CardGameDefinition`
- 43-card deck (special 500 deck) or 52-card variant
- Commands: `BID`, `PASS`, `PLAY_CARD`
- Phases: `dealing` → `bidding` → `kitty` → `playing` → `scoring`

### 8.3 500-specific UI
- Bidding interface (grid of bid options)
- Trump suit indicator
- Trick pile (current trick in center)
- Score tracker (partnership scores across rounds)
- Kitty exchange UI (winner picks up kitty, discards down)

**Done when:** Full game of 500 playable with correct scoring.

---

## Testing Strategy

Testing is a first-class concern. Game logic must be thoroughly tested since bugs in rules/validation are the hardest to debug during live play.

### Unit Tests — Game Logic (Priority: High)

**Framework:** Vitest (fast, native TypeScript/ESM, works seamlessly with pnpm workspaces)

**`packages/shared` tests:**
- Deck creation (correct number of cards, no duplicates)
- Shuffle randomness (statistical distribution over many runs)
- Card comparison utilities

**`packages/game-engine` tests:**
- GameRoom lifecycle: create → join → start → play → end → destroy
- RoomManager: create/find/destroy rooms, handle edge cases (room full, room not found)
- Player join/leave/reconnect flows

**`packages/games` tests (most important — bulk of test effort):**

Each game definition gets exhaustive tests:

1. **State initialization** — correct dealing, correct number of cards per player, deck size after deal
2. **Command validation** — every command type tested for both valid and invalid scenarios:
   - Play a card you don't have → rejected
   - Play out of turn → rejected
   - Play an illegal card (lower rank when higher required) → rejected
   - Play a valid card → accepted
3. **State transitions** — `applyCommand` produces correct next state:
   - Card moves from hand to pile
   - Turn advances to next player
   - Special card effects trigger correctly (e.g., 10 burns pile)
   - Phase transitions (swap → play → finished)
4. **Visible state** — `getVisibleState()` per player:
   - Player can see own hand but not opponents' hands
   - All players can see face-up cards
   - No player can see face-down cards
   - No player can see deck order
5. **Full game simulations** — script an entire game from start to finish:
   - Deterministic deck (seeded shuffle) so tests are reproducible
   - Walk through every turn, assert state at each step
   - Verify winner detection and scoring
6. **Edge cases** — empty deck, last card played, simultaneous-feeling events

**Test helpers:**
```typescript
// Create a game with a known deck order for deterministic testing
function createTestGame(options: {
  players: string[]
  deck?: Card[]  // pre-ordered deck, skips shuffle
}): { state: ShitheadState; definition: ShitheadDefinition }

// Apply a sequence of commands, asserting each succeeds
function playSequence(
  definition: CardGameDefinition,
  state: GameState,
  commands: GameCommand[]
): GameState
```

### Integration Tests — Server (Priority: Medium)

Test the server's Socket.IO layer with real socket connections:

1. **Connection flow** — connect, create room, join room, start game
2. **Command round-trip** — send command via socket, receive state update
3. **Multi-player** — two+ clients in same room, verify each receives correct visible state
4. **Reconnection** — disconnect a client, reconnect, verify state restored
5. **Error handling** — invalid commands return error acknowledgements, game continues

**Approach:** Use `socket.io-client` in tests connecting to a real server instance (spun up in `beforeAll`, torn down in `afterAll`).

### Frontend Tests (Priority: Low — Future)

Not a priority for MVP, but the architecture supports it:

- **Component tests** with Svelte Testing Library + Vitest (render card, simulate click)
- **E2E tests** with Playwright (full game flow in real browsers, mobile viewport testing)
- E2E is the highest-value frontend test: open 2+ browser tabs, play a full game

### Test Commands

All tests run via Turborepo:
```
pnpm test           # run all tests across all packages
pnpm test:watch     # watch mode during development
pnpm test:coverage  # coverage report
```

Each package also supports `pnpm test` individually for focused development.

---

## Phase 9: Future Enhancements (Not in Scope Now)

- Persistent scores / player accounts (add database)
- Spectator mode
- AI/bot players for practice
- Game replay system (leveraging command pattern)
- Additional games
- Deploy to production (containerize, host on Fly.io or similar)

---

## Implementation Order Summary

| Phase | What | Depends On |
|-------|------|-----------|
| 1 | Monorepo scaffold | — |
| 2 | Shared types & utilities | Phase 1 |
| 3 | Game engine | Phase 2 |
| 4 | Shithead game logic | Phase 3 |
| 5 | Server (Hono + Socket.IO) | Phase 3, 4 |
| 6 | Client (SvelteKit UI) | Phase 2, 5 |
| 7 | Polish & mobile | Phase 6 |
| 8 | 500 game | Phase 3, 6 |

Phases 1–6 form the MVP. Phases 7–8 build on it.
