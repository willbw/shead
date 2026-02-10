import { io, type Socket } from 'socket.io-client'
import type {
  Client_to_server_events,
  Server_to_client_events,
  Lobby_state,
  Validation_result,
} from '@shead/shared'
import { connection_store } from './stores/connection.svelte'
import { lobby_store } from './stores/lobby.svelte'
import { game_store } from './stores/game.svelte'

type Typed_socket = Socket<Server_to_client_events, Client_to_server_events>

export const socket: Typed_socket = io('http://localhost:3001', {
  autoConnect: false,
})

// --- Wire socket events to stores ---

socket.on('connect', () => {
  connection_store.connected = true
  connection_store.player_id = socket.id ?? ''
})

socket.on('disconnect', () => {
  connection_store.connected = false
})

socket.on('lobby:update', (lobby: Lobby_state) => {
  lobby_store.room = lobby
})

socket.on('lobby:rooms', (rooms: Lobby_state[]) => {
  lobby_store.rooms = rooms
})

socket.on('game:state', (state: unknown) => {
  game_store.game_state = state as typeof game_store.game_state
  game_store.error_message = null
})

socket.on('game:error', (error: { message: string }) => {
  game_store.error_message = error.message
})

socket.on('game:over', (scores: Record<string, number>) => {
  game_store.scores = scores
})

// --- Promise-based helpers ---

export function connect(): void {
  socket.connect()
}

export function set_name(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit('player:set_name', name, (result) => {
      if (result.ok) {
        connection_store.player_name = name
        resolve()
      } else {
        reject(new Error(result.reason))
      }
    })
  })
}

export function create_room(): Promise<Lobby_state> {
  return new Promise((resolve, reject) => {
    socket.emit('lobby:create', { game_type: 'shithead', max_players: 5 }, (result) => {
      if (result.ok) {
        lobby_store.room = result.room
        resolve(result.room)
      } else {
        reject(new Error(result.reason))
      }
    })
  })
}

export function join_room(room_id: string): Promise<Lobby_state> {
  return new Promise((resolve, reject) => {
    socket.emit('lobby:join', room_id, (result) => {
      if (result.ok) {
        lobby_store.room = result.room
        resolve(result.room)
      } else {
        reject(new Error(result.reason))
      }
    })
  })
}

export function leave_room(): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit('lobby:leave', (result) => {
      if (result.ok) {
        lobby_store.room = null
        game_store.game_state = null
        game_store.selected_card_ids = []
        game_store.scores = null
        resolve()
      } else {
        reject(new Error(result.reason))
      }
    })
  })
}

export function list_rooms(): Promise<Lobby_state[]> {
  return new Promise((resolve) => {
    socket.emit('lobby:list', (rooms) => {
      lobby_store.rooms = rooms
      resolve(rooms)
    })
  })
}

export function start_game(): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit('lobby:start', (result) => {
      if (result.ok) {
        resolve()
      } else {
        reject(new Error(result.reason))
      }
    })
  })
}

export function send_command(cmd: Record<string, unknown>): Promise<Validation_result> {
  return new Promise((resolve) => {
    socket.emit('game:command', cmd as Parameters<Client_to_server_events['game:command']>[0], (result) => {
      if (!result.valid) {
        game_store.error_message = result.reason
      }
      resolve(result)
    })
  })
}
