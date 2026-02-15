import type { Card } from '@shead/shared'

export type Gin_rummy_phase =
  | 'first_draw'
  | 'draw'
  | 'discard'
  | 'knock_response'
  | 'round_over'
  | 'finished'

export interface Gin_rummy_round_result {
  round_number: number
  winner: string | null
  knocker: string | null
  was_gin: boolean
  was_undercut: boolean
  points_awarded: number
  knocker_deadwood: number
  defender_deadwood: number
}

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
  knocker_melds: Card[][] | null
  knocker_deadwood: Card[] | null
  defender_layoffs: Card[] | null
  opponent_hand: Card[] | null
  last_drawn_from_discard_id: string | null
  last_drawn_card_id: string | null
  own_deadwood_points: number
  own_melds: string[][]
  own_deadwood_ids: string[]
  can_knock: boolean
  can_gin: boolean
}
