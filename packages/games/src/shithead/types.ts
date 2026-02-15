import type { Base_command, Card, Ruleset } from '@shead/shared'
import { Direction } from '@shead/shared'

export interface Shithead_player_state {
  hand: Card[]
  face_up: Card[]
  face_down: Card[]
}

export interface Shithead_state {
  deck: Card[]
  discard_pile: Card[]
  players: Map<string, Shithead_player_state>
  player_order: string[]
  current_player_index: number
  direction: Direction
  phase: 'swap' | 'play' | 'finished'
  ready_players: Set<string>
  last_effect: 'burn' | 'reverse' | 'skip' | null
  last_revealed_card: Card | null
  last_action: { player_id: string; description: string } | null
}

export type Shithead_command = Base_command &
  (
    | { type: 'PLAY_CARD'; card_ids: string[] }
    | { type: 'PICK_UP_PILE' }
    | { type: 'SWAP_CARD'; hand_card_id: string; face_up_card_id: string }
    | { type: 'PLAY_FACE_DOWN'; index: number }
    | { type: 'READY' }
    | { type: 'UNREADY' }
  )

export interface Shithead_config {
  num_face_down: number
  num_face_up: number
  num_hand: number
  ruleset?: Ruleset
}

export const DEFAULT_SHITHEAD_CONFIG: Shithead_config = {
  num_face_down: 3,
  num_face_up: 3,
  num_hand: 3,
}

export interface Visible_player_state {
  hand_count: number
  face_up: Card[]
  face_down_count: number
}

export interface Visible_own_player_state {
  hand: Card[]
  face_up: Card[]
  face_down_count: number
}

export interface Visible_shithead_state {
  discard_pile: Card[]
  deck_count: number
  players: Record<string, Visible_player_state>
  own_state: Visible_own_player_state
  current_player: string
  phase: 'swap' | 'play' | 'finished'
  player_order: string[]
  direction: Direction
  ready_players: string[]
  last_effect: 'burn' | 'reverse' | 'skip' | null
  last_revealed_card: Card | null
  last_action: { player_id: string; description: string } | null
}
