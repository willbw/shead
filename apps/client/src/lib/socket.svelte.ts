import { browser } from '$app/environment'
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
import { play_sound } from './sounds'

type Typed_socket = Socket<Server_to_client_events, Client_to_server_events>

const TOKEN_KEY = 'shead_token'
const PLAYER_ID_KEY = 'shead_player_id'

// Only create socket in the browser
export const socket: Typed_socket = browser
  ? io('http://localhost:3001', { autoConnect: false })
  : (undefined as unknown as Typed_socket)

// Track whether a reconnection attempt is in progress
export let reconnecting = $state({ value: false })

// --- Wire socket events to stores (browser only) ---

if (browser) {
  // Debug helpers — run from browser console
  ;(window as any).shead_debug = () => {
    const gs = game_store.game_state
    console.table({
      connected: connection_store.connected,
      player_id: connection_store.player_id,
      player_id_length: connection_store.player_id.length,
      session_player_id: sessionStorage.getItem(PLAYER_ID_KEY),
      session_token: sessionStorage.getItem(TOKEN_KEY) ? '(set)' : '(empty)',
      reconnecting: reconnecting.value,
      ready_players: gs ? JSON.stringify(gs.ready_players) : 'no game state',
      am_in_ready_list: gs ? gs.ready_players.includes(connection_store.player_id) : 'no game state',
      phase: gs?.phase ?? 'no game state',
      current_player: gs?.current_player ?? 'no game state',
    })
  }

  // Skip to face-down test state — call after starting a game
  ;(window as any).shead_face_down_test = () => {
    socket.emit('debug:face_down_test' as any, (result: any) => {
      console.log('face_down_test:', result)
    })
  }

  socket.on('connect', () => {
    connection_store.connected = true

    // Attempt reconnection if we have a saved token
    const token = sessionStorage.getItem(TOKEN_KEY)
    if (token) {
      // Restore player_id immediately so derived state works before the async callback
      const saved_id = sessionStorage.getItem(PLAYER_ID_KEY)
      if (saved_id) {
        connection_store.player_id = saved_id
      }
      reconnecting.value = true
      socket.emit('player:reconnect', token, (result) => {
        if (result.ok) {
          connection_store.player_id = result.player_id
          sessionStorage.setItem(PLAYER_ID_KEY, result.player_id)
          connection_store.player_name = result.player_name
          if (result.room) {
            lobby_store.room = result.room
          }
          if (result.game_state) {
            game_store.game_state = result.game_state as typeof game_store.game_state
          }
        } else {
          // Token invalid — clear it
          sessionStorage.removeItem(TOKEN_KEY)
          sessionStorage.removeItem(PLAYER_ID_KEY)
          connection_store.player_id = ''
        }
        reconnecting.value = false
      })
    }
  })

  // Server tells us our persistent player_id and token on every fresh connection
  socket.on('session:init', (data) => {
    // Only use if we didn't already reconnect with an existing session
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      connection_store.player_id = data.player_id
      sessionStorage.setItem(PLAYER_ID_KEY, data.player_id)
    }
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
    const prev = game_store.game_state
    const next = state as typeof game_store.game_state
    game_store.game_state = next
    game_store.error_message = null

    // Sound effects based on state changes
    if (next && prev) {
      if (next.last_effect === 'burn' && prev.last_effect !== 'burn') {
        play_sound('burn')
      } else if (next.last_effect === 'skip' && prev.last_effect !== 'skip') {
        play_sound('skip')
      } else if (next.last_effect === 'reverse' && prev.last_effect !== 'reverse') {
        play_sound('reverse')
      } else if (next.current_player !== prev.current_player) {
        const my_id = connection_store.player_id
        if (next.current_player === my_id) {
          play_sound('your_turn')
        } else {
          play_sound('card_play')
        }
      }
    }
  })

  socket.on('game:error', (error: { message: string }) => {
    game_store.error_message = error.message
    play_sound('error')
  })

  socket.on('game:over', (scores: Record<string, number>) => {
    game_store.scores = scores
    play_sound('game_over')
  })
}

// --- Promise-based helpers ---

export function connect(): void {
  if (!browser) return
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
        sessionStorage.setItem(TOKEN_KEY, result.player_token)
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
        sessionStorage.setItem(TOKEN_KEY, result.player_token)
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
        sessionStorage.removeItem(TOKEN_KEY)
        sessionStorage.removeItem(PLAYER_ID_KEY)
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
        play_sound('error')
      }
      resolve(result)
    })
  })
}
