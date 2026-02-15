import type { Base_command } from '@shead/shared'
import type { Game_room } from '@shead/game-engine'
import type { Shithead_state, Shithead_command } from '@shead/games'
import { compute_bot_commands, is_bot_player } from '@shead/games'

const BOT_DELAY_MS = 800

export class Bot_controller {
  private room: Game_room<Shithead_state, Shithead_command, unknown>
  private bot_ids: string[]
  private unsubscribe: () => void
  private pending_timer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false

  constructor(
    room: Game_room<Shithead_state, Shithead_command, unknown>,
    bot_ids: string[],
  ) {
    this.room = room
    this.bot_ids = bot_ids
    this.unsubscribe = room.on((event) => {
      if (this.destroyed) return
      if (event.type === 'state_changed') {
        this.schedule_bot_move()
      }
      if (event.type === 'game_over') {
        this.destroy()
      }
    })

    // Initial check in case the game already started
    this.schedule_bot_move()
  }

  private schedule_bot_move(): void {
    if (this.pending_timer) {
      clearTimeout(this.pending_timer)
    }
    this.pending_timer = setTimeout(() => {
      this.pending_timer = null
      this.execute_bot_moves()
    }, BOT_DELAY_MS)
  }

  private execute_bot_moves(): void {
    if (this.destroyed) return
    const state = this.room.get_state()
    if (!state) return

    for (const bot_id of this.bot_ids) {
      const commands = compute_bot_commands(state, bot_id)
      for (const cmd of commands) {
        const result = this.room.handle_command(cmd)
        if (!result.valid) break
        // After each command, re-check state (it may have changed)
        const new_state = this.room.get_state()
        if (!new_state || new_state.phase === 'finished') return
      }
    }
  }

  destroy(): void {
    this.destroyed = true
    if (this.pending_timer) {
      clearTimeout(this.pending_timer)
      this.pending_timer = null
    }
    this.unsubscribe()
  }
}
