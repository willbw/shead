import type { Card } from '@shead/shared'
import { Direction } from '@shead/shared'

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
}

export const game_store = $state<{
  game_state: Visible_shithead_state | null
  selected_card_ids: string[]
  error_message: string | null
  scores: Record<string, number> | null
}>({
  game_state: null,
  selected_card_ids: [],
  error_message: null,
  scores: null,
})
