# STYLE.md — Code Style Guide

## Naming Conventions

### Functions & Variables
- **snake_case** for all functions, variables, and parameters
- Examples: `create_deck()`, `validate_command()`, `player_id`, `visible_state`

### Types, Interfaces & Enums
- **Capitalized_snake_case** for types, interfaces, enums, and type aliases
- Examples: `Game_state`, `Card_game_definition`, `Validation_result`, `Player_info`

### Constants
- **UPPER_SNAKE_CASE** for true constants (compile-time known values)
- Examples: `MAX_PLAYERS`, `DEFAULT_HAND_SIZE`

### Files & Directories
- **snake_case** for all file and directory names
- Examples: `game_engine.ts`, `card_utils.ts`, `shithead_definition.ts`

## Examples

```typescript
// Types — Capitalized_snake_case
interface Card_game_definition<T_state, T_command, T_config> {
  initial_state(config: T_config, players: Player[]): T_state
  validate_command(state: T_state, cmd: T_command): Validation_result
}

type Game_command =
  | { type: 'PLAY_CARD'; player_id: string; card_id: string }
  | { type: 'DRAW_CARD'; player_id: string }

interface Player_state {
  hand: Card[]
  face_up: Card[]
  face_down: Card[]
}

// Functions & variables — snake_case
function create_deck(): Card[] { ... }
function get_visible_state(state: Game_state, player_id: string): Visible_state { ... }

const current_player = get_next_player(state)
const is_valid = validate_command(state, cmd)

// Constants — UPPER_SNAKE_CASE
const MAX_PLAYERS = 5
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const
```
