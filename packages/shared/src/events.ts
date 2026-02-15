import type { Lobby_state } from './lobby'
import type { Base_command, Validation_result, Bot_difficulty } from './game'
import type { Create_room_opts } from './lobby'

export interface Server_to_client_events {
  'session:init': (data: { player_id: string; token: string; enabled_games: string[] }) => void
  'game:state': (state: unknown) => void
  'game:error': (error: { message: string }) => void
  'game:over': (scores: Record<string, number>) => void
  'lobby:update': (lobby: Lobby_state) => void
  'lobby:rooms': (rooms: Lobby_state[]) => void
}

export interface Client_to_server_events {
  'player:set_name': (name: string, ack: (result: { ok: true } | { ok: false; reason: string }) => void) => void
  'player:reconnect': (token: string, ack: (result: { ok: true; player_id: string; player_name: string; room: Lobby_state | null; game_state: unknown | null } | { ok: false; reason: string }) => void) => void
  'lobby:create': (opts: Create_room_opts, ack: (result: { ok: true; room: Lobby_state; player_token: string } | { ok: false; reason: string }) => void) => void
  'lobby:join': (room_id: string, ack: (result: { ok: true; room: Lobby_state; player_token: string } | { ok: false; reason: string }) => void) => void
  'lobby:leave': (ack: (result: { ok: true } | { ok: false; reason: string }) => void) => void
  'lobby:list': (ack: (rooms: Lobby_state[]) => void) => void
  'lobby:start': (ack: (result: { ok: true } | { ok: false; reason: string }) => void) => void
  'game:command': (cmd: Base_command & Record<string, unknown>, ack: (result: Validation_result) => void) => void
  'lobby:practice': (game_type: string, difficulty: Bot_difficulty, bot_count: number, ack: (result: { ok: true; room: Lobby_state; player_token: string } | { ok: false; reason: string }) => void) => void
}
