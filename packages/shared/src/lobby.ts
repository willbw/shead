import type { Player } from './player'

export interface Lobby_state {
  room_id: string
  players: Player[]
  game_type: string
  status: 'waiting' | 'in_progress' | 'finished'
}

export interface Create_room_opts {
  game_type: string
  max_players: number
}
