import type { Base_command, Card } from '@shead/shared'

export type Gin_rummy_phase =
  | 'first_draw'
  | 'draw'
  | 'discard'
  | 'knock_response'
  | 'round_over'
  | 'finished'

export interface Gin_rummy_player_state {
  hand: Card[]
}

export interface Gin_rummy_round_result {
  round_number: number
  winner: string | null  // null = draw (stock exhaustion)
  knocker: string | null
  was_gin: boolean
  was_undercut: boolean
  points_awarded: number
  knocker_deadwood: number
  defender_deadwood: number
}

export interface Gin_rummy_state {
  stock: Card[]
  discard_pile: Card[]
  players: Map<string, Gin_rummy_player_state>
  player_order: [string, string]
  current_player: string
  phase: Gin_rummy_phase
  first_draw_passes: number
  knocker_id: string | null
  knocker_melds: Card[][] | null
  knocker_deadwood: Card[] | null
  defender_layoffs: Card[] | null
  scores: Map<string, number>
  round_history: Gin_rummy_round_result[]
  dealer: string
  target_score: number
  round_number: number
  last_drawn_from_discard_id: string | null
  last_drawn_card_id: string | null
}

export type Gin_rummy_command = Base_command & (
  | { type: 'DRAW_STOCK' }
  | { type: 'DRAW_DISCARD' }
  | { type: 'DISCARD'; card_id: string }
  | { type: 'KNOCK'; melds: string[][] }
  | { type: 'GIN'; melds: string[][] }
  | { type: 'LAY_OFF'; card_ids: string[]; meld_index: number }
  | { type: 'ACCEPT_KNOCK' }
  | { type: 'PASS_FIRST_DRAW' }
  | { type: 'NEXT_ROUND' }
)

export interface Gin_rummy_config {
  target_score?: number
}

export const DEFAULT_GIN_RUMMY_CONFIG: Gin_rummy_config = {
  target_score: 100,
}

// --- Visible state types (sent to client) ---

export interface Visible_gin_rummy_opponent {
  hand_count: number
}

export interface Visible_gin_rummy_state {
  discard_top: Card | null
  stock_count: number
  opponent: Visible_gin_rummy_opponent
  opponent_id: string
  own_hand: Card[]
  current_player: string
  phase: Gin_rummy_phase
  player_order: [string, string]
  scores: Record<string, number>
  round_history: Gin_rummy_round_result[]
  round_number: number
  target_score: number
  knocker_id: string | null
  // Visible during knock_response / round_over
  knocker_melds: Card[][] | null
  knocker_deadwood: Card[] | null
  defender_layoffs: Card[] | null
  // In round_over/knock_response, show opponent's hand too
  opponent_hand: Card[] | null
  last_drawn_from_discard_id: string | null
  last_drawn_card_id: string | null
  // Computed from optimal meld arrangement of own hand
  own_deadwood_points: number
  can_knock: boolean
  can_gin: boolean
}
