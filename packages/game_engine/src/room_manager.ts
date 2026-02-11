import type { Base_command, Player, Validation_result } from '@shead/shared'
import type { Card_game_definition } from './card_game_definition'
import { Game_room } from './game_room'

export class Room_manager {
  private rooms: Map<string, Game_room<unknown, Base_command, unknown>> = new Map()
  private definitions: Map<string, Card_game_definition<unknown, Base_command, unknown>> = new Map()

  private generate_room_id(): string {
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    const digits = '0123456789'
    for (;;) {
      let id = ''
      for (let i = 0; i < 3; i++) id += letters[Math.floor(Math.random() * 26)]
      for (let i = 0; i < 3; i++) id += digits[Math.floor(Math.random() * 10)]
      if (!this.rooms.has(id)) return id
    }
  }

  register_game(definition: Card_game_definition<unknown, Base_command, unknown>): void {
    this.definitions.set(definition.id, definition)
  }

  create_room(game_type: string, config: unknown): Game_room<unknown, Base_command, unknown> | null {
    const definition = this.definitions.get(game_type)
    if (!definition) {
      return null
    }
    const room_id = this.generate_room_id()
    const room = new Game_room(room_id, definition, config)
    this.rooms.set(room_id, room)
    return room
  }

  get_room(room_id: string): Game_room<unknown, Base_command, unknown> | null {
    return this.rooms.get(room_id) ?? null
  }

  join_room(room_id: string, player: Player): Validation_result {
    const room = this.rooms.get(room_id)
    if (!room) {
      return { valid: false, reason: 'Room not found' }
    }
    return room.add_player(player)
  }

  destroy_room(room_id: string): boolean {
    return this.rooms.delete(room_id)
  }

  list_rooms(): Game_room<unknown, Base_command, unknown>[] {
    return Array.from(this.rooms.values())
  }
}
