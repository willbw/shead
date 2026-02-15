import type { Bot_command_fn } from './bot_controller'

const bot_registry = new Map<string, Bot_command_fn>()

export function register_bot(game_type: string, fn: Bot_command_fn): void {
  bot_registry.set(game_type, fn)
}

export function get_bot_fn(game_type: string): Bot_command_fn | null {
  return bot_registry.get(game_type) ?? null
}
