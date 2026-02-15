export { shithead_definition, clone_state } from './definition'
export type {
  Shithead_state,
  Shithead_player_state,
  Shithead_command,
  Shithead_config,
  Visible_shithead_state,
  Visible_player_state,
  Visible_own_player_state,
} from './types'
export { DEFAULT_SHITHEAD_CONFIG } from './types'
export { Direction } from '@shead/shared'
export { compute_bot_commands, compute_bot_commands_for_difficulty, compute_swap_commands, compute_play_command, is_bot_player } from './bot'
export { ismcts_compute_command, MEDIUM_CONFIG, HARD_CONFIG, type Ismcts_config } from './bot_ismcts'
