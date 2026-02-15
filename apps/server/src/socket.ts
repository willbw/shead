import type { Server as HttpServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server, Socket } from 'socket.io'
import type {
  Server_to_client_events,
  Client_to_server_events,
  Base_command,
  Lobby_state,
  Player,
} from '@shead/shared'
import { Room_manager } from '@shead/game-engine'
import type { Game_room } from '@shead/game-engine'
import { create_deck } from '@shead/shared'
import { is_bot_player } from '@shead/games'
import { readFileSync } from 'node:fs'
import { Bot_controller } from './bot_controller'
import { get_bot_fn } from './bot_registry'
import { logger } from './logger'

const game_config: Record<string, unknown> = (() => {
  try {
    const raw = readFileSync('game_config.json', 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
})()

const enabled_games: string[] = Array.isArray(game_config.enabled_games)
  ? game_config.enabled_games as string[]
  : ['shithead']

type Typed_server = Server<Client_to_server_events, Server_to_client_events>
type Typed_socket = Socket<Client_to_server_events, Server_to_client_events>

interface Session {
  player_id: string
  token: string
  socket_id: string
  player: Player
  room_id: string | null
  disconnect_timer: ReturnType<typeof setTimeout> | null
}

const DISCONNECT_TIMEOUT_MS = 60_000

export function create_socket_server(
  http_server: HttpServer,
  room_manager: Room_manager,
): Typed_server {
  const io: Typed_server = new Server(http_server, {
    cors: { origin: '*' },
  })

  // Map token → Session (persistent across reconnects)
  const sessions = new Map<string, Session>()

  // Map socket_id → Session (for quick lookup on current connection)
  const socket_sessions = new Map<string, Session>()

  // Map room_id → Bot_controller (for practice games)
  const bot_controllers = new Map<string, Bot_controller>()

  function get_lobby_state(room: Game_room<unknown, Base_command, unknown>): Lobby_state {
    return {
      room_id: room.id,
      players: room.get_players(),
      game_type: room.definition.id,
      status: room.get_status(),
    }
  }

  function broadcast_lobby_update(room: Game_room<unknown, Base_command, unknown>): void {
    const lobby = get_lobby_state(room)
    io.to(room.id).emit('lobby:update', lobby)
  }

  function broadcast_game_state(room: Game_room<unknown, Base_command, unknown>): void {
    for (const player of room.get_players()) {
      // Find the session for this player to get their current socket_id
      const session = find_session_by_player_id(player.id)
      if (session && session.player.connected) {
        const state = room.get_state_for_player(player.id)
        io.to(session.socket_id).emit('game:state', state)
      }
    }
  }

  function broadcast_game_over(room: Game_room<unknown, Base_command, unknown>, scores: Map<string, number>): void {
    const scores_obj: Record<string, number> = {}
    for (const [id, score] of scores) {
      scores_obj[id] = score
    }
    io.to(room.id).emit('game:over', scores_obj)
  }

  function find_session_by_player_id(player_id: string): Session | undefined {
    for (const session of sessions.values()) {
      if (session.player_id === player_id) return session
    }
    return undefined
  }

  io.on('connection', (socket: Typed_socket) => {
    // Generate persistent identity for this connection
    const player_id = randomUUID()
    const token = randomUUID()
    const session: Session = {
      player_id,
      token,
      socket_id: socket.id,
      player: { id: player_id, name: `Player-${player_id.slice(0, 4)}`, connected: true },
      room_id: null,
      disconnect_timer: null,
    }
    sessions.set(token, session)
    socket_sessions.set(socket.id, session)

    // Tell the client its persistent player_id and token
    socket.emit('session:init', { player_id, token, enabled_games })

    socket.on('player:reconnect', (incoming_token, ack) => {
      const existing = sessions.get(incoming_token)
      if (!existing) {
        ack({ ok: false, reason: 'Session not found' })
        return
      }

      // Cancel any pending disconnect timer
      if (existing.disconnect_timer) {
        clearTimeout(existing.disconnect_timer)
        existing.disconnect_timer = null
      }

      // Clean up the fresh session we just created for this socket
      sessions.delete(token)
      socket_sessions.delete(socket.id)

      // Rebind the existing session to this new socket
      const old_socket_id = existing.socket_id
      socket_sessions.delete(old_socket_id)
      existing.socket_id = socket.id
      existing.player.connected = true
      socket_sessions.set(socket.id, existing)

      // Rejoin socket.io room
      if (existing.room_id) {
        socket.join(existing.room_id)
        const room = room_manager.get_room(existing.room_id)
        if (room) {
          broadcast_lobby_update(room)

          // Send current game state if game is in progress
          const status = room.get_status()
          if (status === 'in_progress' || status === 'finished') {
            const game_state = room.get_state_for_player(existing.player_id)
            ack({
              ok: true,
              player_id: existing.player_id,
              player_name: existing.player.name,
              room: get_lobby_state(room),
              game_state,
            })
          } else {
            ack({
              ok: true,
              player_id: existing.player_id,
              player_name: existing.player.name,
              room: get_lobby_state(room),
              game_state: null,
            })
          }
        } else {
          // Room was destroyed while disconnected
          existing.room_id = null
          ack({
            ok: true,
            player_id: existing.player_id,
            player_name: existing.player.name,
            room: null,
            game_state: null,
          })
        }
      } else {
        ack({
          ok: true,
          player_id: existing.player_id,
          player_name: existing.player.name,
          room: null,
          game_state: null,
        })
      }

      // Rebind all event handlers to use the existing session
      rebind_session_handlers(socket, existing)
    })

    // Set up handlers for this session
    setup_session_handlers(socket, session)

    socket.on('disconnect', () => {
      const current_session = socket_sessions.get(socket.id)
      if (!current_session) return

      current_session.player.connected = false

      if (current_session.room_id) {
        const room = room_manager.get_room(current_session.room_id)
        if (room) {
          broadcast_lobby_update(room)

          if (room.get_status() === 'waiting') {
            // In waiting room: remove player immediately
            room.remove_player(current_session.player_id)
            current_session.room_id = null
            if (room.get_player_count() === 0) {
              room_manager.destroy_room(room.id)
            } else {
              broadcast_lobby_update(room)
            }
            // Clean up session immediately for waiting players
            sessions.delete(current_session.token)
          } else {
            // In-progress game: start disconnect timer
            current_session.disconnect_timer = setTimeout(() => {
              // Player didn't reconnect in time — remove them
              const r = room_manager.get_room(current_session.room_id!)
              if (r) {
                r.remove_player(current_session.player_id)
                if (r.get_player_count() === 0) {
                  room_manager.destroy_room(r.id)
                } else {
                  broadcast_lobby_update(r)
                  broadcast_game_state(r)
                }
              }
              current_session.room_id = null
              sessions.delete(current_session.token)
            }, DISCONNECT_TIMEOUT_MS)
          }
        }
      } else {
        // Not in a room — clean up session
        sessions.delete(current_session.token)
      }

      socket_sessions.delete(socket.id)
    })
  })

  function setup_session_handlers(socket: Typed_socket, session: Session): void {
    socket.on('player:set_name', (name, ack) => {
      const s = socket_sessions.get(socket.id)
      if (!s) { ack({ ok: false, reason: 'No session' }); return }
      const trimmed = name.trim()
      if (trimmed.length === 0 || trimmed.length > 20) {
        ack({ ok: false, reason: 'Name must be 1-20 characters' })
        return
      }
      s.player.name = trimmed
      if (s.room_id) {
        const room = room_manager.get_room(s.room_id)
        if (room) broadcast_lobby_update(room)
      }
      ack({ ok: true })
    })

    socket.on('lobby:list', (ack) => {
      const rooms = room_manager.list_rooms().map(get_lobby_state)
      ack(rooms)
    })

    socket.on('lobby:create', (opts, ack) => {
      const s = socket_sessions.get(socket.id)
      if (!s) { ack({ ok: false, reason: 'No session' }); return }

      if (!enabled_games.includes(opts.game_type)) {
        ack({ ok: false, reason: `Game not enabled: ${opts.game_type}` })
        return
      }

      const room = room_manager.create_room(opts.game_type, game_config)
      if (!room) {
        ack({ ok: false, reason: `Unknown game type: ${opts.game_type}` })
        return
      }

      const join_result = room.add_player(s.player)
      if (!join_result.valid) {
        ack({ ok: false, reason: join_result.reason })
        return
      }

      s.room_id = room.id
      socket.join(room.id)
      setup_room_listeners(room)
      ack({ ok: true, room: get_lobby_state(room), player_token: s.token })
    })

    socket.on('lobby:join', (room_id, ack) => {
      const s = socket_sessions.get(socket.id)
      if (!s) { ack({ ok: false, reason: 'No session' }); return }

      if (s.room_id) {
        ack({ ok: false, reason: 'Already in a room' })
        return
      }

      const room = room_manager.get_room(room_id)
      if (!room) {
        ack({ ok: false, reason: 'Room not found' })
        return
      }

      const result = room.add_player(s.player)
      if (!result.valid) {
        ack({ ok: false, reason: result.reason })
        return
      }

      s.room_id = room.id
      socket.join(room.id)
      setup_room_listeners(room)
      ack({ ok: true, room: get_lobby_state(room), player_token: s.token })
      broadcast_lobby_update(room)
    })

    socket.on('lobby:leave', (ack) => {
      const s = socket_sessions.get(socket.id)
      if (!s) { ack({ ok: false, reason: 'No session' }); return }

      if (!s.room_id) {
        ack({ ok: false, reason: 'Not in a room' })
        return
      }

      const room = room_manager.get_room(s.room_id)
      if (room) {
        room.remove_player(s.player_id)
        socket.leave(room.id)

        if (room.get_player_count() === 0) {
          const bc = bot_controllers.get(room.id)
          if (bc) {
            bc.destroy()
            bot_controllers.delete(room.id)
          }
          room_manager.destroy_room(room.id)
        } else {
          broadcast_lobby_update(room)
        }
      }

      s.room_id = null
      ack({ ok: true })
    })

    socket.on('lobby:start', (ack) => {
      const s = socket_sessions.get(socket.id)
      if (!s) { ack({ ok: false, reason: 'No session' }); return }

      if (!s.room_id) {
        ack({ ok: false, reason: 'Not in a room' })
        return
      }

      const room = room_manager.get_room(s.room_id)
      if (!room) {
        ack({ ok: false, reason: 'Room not found' })
        return
      }

      const result = room.start()
      if (!result.valid) {
        ack({ ok: false, reason: result.reason })
        return
      }

      ack({ ok: true })
      broadcast_lobby_update(room)
    })

    socket.on('lobby:practice', (game_type, difficulty, bot_count, ack) => {
      const s = socket_sessions.get(socket.id)
      if (!s) { ack({ ok: false, reason: 'No session' }); return }

      if (!enabled_games.includes(game_type)) {
        ack({ ok: false, reason: `Game not enabled: ${game_type}` })
        return
      }

      // Auto-leave previous room (e.g. finished game)
      if (s.room_id) {
        const old_room = room_manager.get_room(s.room_id)
        if (old_room) {
          old_room.remove_player(s.player_id)
          socket.leave(old_room.id)
          if (old_room.get_player_count() === 0) {
            const bc = bot_controllers.get(old_room.id)
            if (bc) {
              bc.destroy()
              bot_controllers.delete(old_room.id)
            }
            room_manager.destroy_room(old_room.id)
          }
        }
        s.room_id = null
      }

      const bot_fn = get_bot_fn(game_type)
      if (!bot_fn) {
        ack({ ok: false, reason: `No bot available for game type: ${game_type}` })
        return
      }

      // Practice rooms use default config (ignore game_config which may have a small deck)
      const room = room_manager.create_room(game_type, {})
      if (!room) {
        ack({ ok: false, reason: `Unknown game type: ${game_type}` })
        return
      }

      // Clamp bot_count based on game's max_players
      const max_bots = room.definition.max_players - 1
      const count = Math.max(1, Math.min(max_bots, Math.floor(bot_count) || 1))
      const difficulty_label = difficulty === 'easy' ? '' : difficulty === 'medium' ? ' (Med)' : ' (Hard)'
      const bot_ids: string[] = []

      room.add_player(s.player)
      for (let i = 1; i <= count; i++) {
        const bot_id = `bot-${i}`
        bot_ids.push(bot_id)
        const bot_name = count === 1 ? `Bot${difficulty_label}` : `Bot ${i}${difficulty_label}`
        room.add_player({ id: bot_id, name: bot_name, connected: true })
      }

      s.room_id = room.id
      socket.join(room.id)
      setup_room_listeners(room)

      let start_result
      try {
        start_result = room.start()
      } catch (e) {
        ack({ ok: false, reason: (e as Error).message || 'Failed to start game' })
        room_manager.destroy_room(room.id)
        s.room_id = null
        return
      }
      if (!start_result.valid) {
        ack({ ok: false, reason: start_result.reason })
        room_manager.destroy_room(room.id)
        s.room_id = null
        return
      }

      const controller = new Bot_controller(room, bot_ids, difficulty, bot_fn)
      bot_controllers.set(room.id, controller)

      ack({ ok: true, room: get_lobby_state(room), player_token: s.token })
      broadcast_lobby_update(room)
    })

    socket.on('game:command', (cmd, ack) => {
      const s = socket_sessions.get(socket.id)
      if (!s) { ack({ valid: false, reason: 'No session' }); return }

      if (!s.room_id) {
        ack({ valid: false, reason: 'Not in a room' })
        return
      }

      const room = room_manager.get_room(s.room_id)
      if (!room) {
        ack({ valid: false, reason: 'Room not found' })
        return
      }

      const full_cmd = { ...cmd, player_id: s.player_id } as Base_command & Record<string, unknown>
      const result = room.handle_command(full_cmd)
      ack(result)
    })

    // Debug: skip to face-down phase for the calling player (shithead only)
    socket.on('debug:face_down_test' as any, (ack: any) => {
      const s = socket_sessions.get(socket.id)
      if (!s || !s.room_id) { ack?.({ ok: false }); return }

      const room = room_manager.get_room(s.room_id)
      if (!room || room.definition.id !== 'shithead') { ack?.({ ok: false }); return }

      const state = room._debug_get_state() as any
      if (!state) { ack?.({ ok: false }); return }

      // Build some known cards for face-up/face-down
      const deck = create_deck()
      const card_pool = [...deck]

      for (const [pid, ps] of state.players) {
        // Collect all this player's cards back, we'll reassign
        ps.hand = []
        if (pid === s.player_id) {
          // Calling player: face_up with playable cards, face_down with mix
          ps.face_up = card_pool.splice(0, 3)
          ps.face_down = card_pool.splice(0, 3)
        } else {
          // Opponent: give them a hand so they can play normally
          ps.face_up = []
          ps.face_down = []
          ps.hand = card_pool.splice(0, 5)
        }
      }

      state.deck = []
      state.discard_pile = [card_pool.splice(0, 1)[0]]
      state.phase = 'play'
      state.ready_players = new Set(state.player_order)

      room._debug_set_state(state)
      ack?.({ ok: true })
    })
  }

  // After reconnect, socket already has the old handlers from initial connection.
  // We just need to re-register the session-aware handlers.
  function rebind_session_handlers(socket: Typed_socket, session: Session): void {
    // socket.io allows multiple listeners; remove all then re-add
    socket.removeAllListeners('player:set_name')
    socket.removeAllListeners('lobby:list')
    socket.removeAllListeners('lobby:create')
    socket.removeAllListeners('lobby:join')
    socket.removeAllListeners('lobby:leave')
    socket.removeAllListeners('lobby:start')
    socket.removeAllListeners('lobby:practice')
    socket.removeAllListeners('game:command')
    socket.removeAllListeners('debug:face_down_test')
    setup_session_handlers(socket, session)
  }

  // Track which rooms already have listeners to avoid duplicates
  const rooms_with_listeners = new Set<string>()

  function debug_log_state(room: Game_room<unknown, Base_command, unknown>): void {
    if (room.definition.id !== 'shithead') return
    const state = room.get_state() as any
    if (!state || state.phase !== 'play') return

    const action = state.last_action?.description ?? ''
    const current = state.player_order[state.current_player_index]
    const current_name = room.get_players().find(p => p.id === current)?.name ?? current

    const players: Record<string, { hand: string; face_up: string; face_down: string }> = {}
    for (const [pid, ps] of state.players) {
      const name = room.get_players().find(p => p.id === pid)?.name ?? pid
      players[name] = {
        hand: ps.hand.map((c: any) => c.rank).join(', '),
        face_up: ps.face_up.map((c: any) => c.rank).join(', '),
        face_down: ps.face_down.map((c: any) => c.rank).join(', '),
      }
    }

    logger.info({
      room: room.id,
      action,
      turn: current_name,
      pile: state.discard_pile.slice(-3).map((c: any) => c.rank),
      pile_size: state.discard_pile.length,
      deck: state.deck.length,
      players,
    }, `${action ? action + ' | ' : ''}${current_name}'s turn`)
  }

  function setup_room_listeners(room: Game_room<unknown, Base_command, unknown>): void {
    if (rooms_with_listeners.has(room.id)) return
    rooms_with_listeners.add(room.id)

    room.on((event) => {
      if (event.type === 'state_changed') {
        debug_log_state(room)
        broadcast_game_state(room)
      }
      if (event.type === 'game_over') {
        broadcast_game_over(room, event.scores)
        setTimeout(() => {
          const bc = bot_controllers.get(room.id)
          if (bc) {
            bc.destroy()
            bot_controllers.delete(room.id)
          }
          room_manager.destroy_room(room.id)
          rooms_with_listeners.delete(room.id)
        }, 60_000)
      }
    })
  }

  return io
}
