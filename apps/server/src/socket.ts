import type { Server as HttpServer } from 'node:http'
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

type Typed_server = Server<Client_to_server_events, Server_to_client_events>
type Typed_socket = Socket<Client_to_server_events, Server_to_client_events>

interface Connected_player {
  socket_id: string
  player: Player
  room_id: string | null
}

export function create_socket_server(
  http_server: HttpServer,
  room_manager: Room_manager,
): Typed_server {
  const io: Typed_server = new Server(http_server, {
    cors: { origin: '*' },
  })

  // Map socket.id → connected player info
  const connected_players = new Map<string, Connected_player>()

  // Map player.id → socket.id (for reconnection)
  const player_sockets = new Map<string, string>()

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
      const socket_id = player_sockets.get(player.id)
      if (socket_id) {
        const state = room.get_state_for_player(player.id)
        io.to(socket_id).emit('game:state', state)
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

  io.on('connection', (socket: Typed_socket) => {
    const player_id = socket.id
    const player_info: Connected_player = {
      socket_id: socket.id,
      player: { id: player_id, name: `Player-${player_id.slice(0, 4)}`, connected: true },
      room_id: null,
    }
    connected_players.set(socket.id, player_info)
    player_sockets.set(player_id, socket.id)

    socket.on('player:set_name', (name, ack) => {
      const trimmed = name.trim()
      if (trimmed.length === 0 || trimmed.length > 20) {
        ack({ ok: false, reason: 'Name must be 1-20 characters' })
        return
      }
      player_info.player.name = trimmed
      // Update name in room if in one
      if (player_info.room_id) {
        const room = room_manager.get_room(player_info.room_id)
        if (room) {
          broadcast_lobby_update(room)
        }
      }
      ack({ ok: true })
    })

    socket.on('lobby:list', (ack) => {
      const rooms = room_manager.list_rooms().map(get_lobby_state)
      ack(rooms)
    })

    socket.on('lobby:create', (opts, ack) => {
      const room = room_manager.create_room(opts.game_type, {})
      if (!room) {
        ack({ ok: false, reason: `Unknown game type: ${opts.game_type}` })
        return
      }

      const join_result = room.add_player(player_info.player)
      if (!join_result.valid) {
        ack({ ok: false, reason: join_result.reason })
        return
      }

      player_info.room_id = room.id
      socket.join(room.id)

      // Listen for room events
      setup_room_listeners(room)

      ack({ ok: true, room: get_lobby_state(room) })
    })

    socket.on('lobby:join', (room_id, ack) => {
      if (player_info.room_id) {
        ack({ ok: false, reason: 'Already in a room' })
        return
      }

      const room = room_manager.get_room(room_id)
      if (!room) {
        ack({ ok: false, reason: 'Room not found' })
        return
      }

      const result = room.add_player(player_info.player)
      if (!result.valid) {
        ack({ ok: false, reason: result.reason })
        return
      }

      player_info.room_id = room.id
      socket.join(room.id)
      ack({ ok: true, room: get_lobby_state(room) })
    })

    socket.on('lobby:leave', (ack) => {
      if (!player_info.room_id) {
        ack({ ok: false, reason: 'Not in a room' })
        return
      }

      const room = room_manager.get_room(player_info.room_id)
      if (room) {
        room.remove_player(player_info.player.id)
        socket.leave(room.id)

        if (room.get_player_count() === 0) {
          room_manager.destroy_room(room.id)
        } else {
          broadcast_lobby_update(room)
        }
      }

      player_info.room_id = null
      ack({ ok: true })
    })

    socket.on('lobby:start', (ack) => {
      if (!player_info.room_id) {
        ack({ ok: false, reason: 'Not in a room' })
        return
      }

      const room = room_manager.get_room(player_info.room_id)
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
      broadcast_game_state(room)
    })

    socket.on('game:command', (cmd, ack) => {
      if (!player_info.room_id) {
        ack({ valid: false, reason: 'Not in a room' })
        return
      }

      const room = room_manager.get_room(player_info.room_id)
      if (!room) {
        ack({ valid: false, reason: 'Room not found' })
        return
      }

      // Ensure the command's player_id matches the socket's player
      const full_cmd = { ...cmd, player_id: player_info.player.id } as Base_command & Record<string, unknown>
      const result = room.handle_command(full_cmd)
      ack(result)

      if (result.valid) {
        broadcast_game_state(room)
      }
    })

    socket.on('disconnect', () => {
      if (player_info.room_id) {
        const room = room_manager.get_room(player_info.room_id)
        if (room) {
          // Mark player as disconnected rather than removing
          player_info.player.connected = false
          broadcast_lobby_update(room)

          // If room is waiting, remove the player
          if (room.get_status() === 'waiting') {
            room.remove_player(player_info.player.id)
            if (room.get_player_count() === 0) {
              room_manager.destroy_room(room.id)
            } else {
              broadcast_lobby_update(room)
            }
          }
        }
      }

      connected_players.delete(socket.id)
      player_sockets.delete(player_id)
    })
  })

  // Track which rooms already have listeners to avoid duplicates
  const rooms_with_listeners = new Set<string>()

  function setup_room_listeners(room: Game_room<unknown, Base_command, unknown>): void {
    if (rooms_with_listeners.has(room.id)) return
    rooms_with_listeners.add(room.id)

    room.on((event) => {
      if (event.type === 'game_over') {
        broadcast_game_over(room, event.scores)
        // Clean up room after a delay
        setTimeout(() => {
          room_manager.destroy_room(room.id)
          rooms_with_listeners.delete(room.id)
        }, 60_000)
      }
    })
  }

  return io
}
