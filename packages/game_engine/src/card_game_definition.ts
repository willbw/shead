import type { Base_command, Player, Validation_result } from '@shead/shared'

export interface Card_game_definition<
  T_state,
  T_command extends Base_command,
  T_config,
> {
  id: string
  name: string
  min_players: number
  max_players: number
  initial_state(config: T_config, players: Player[]): T_state
  validate_command(state: T_state, cmd: T_command): Validation_result
  apply_command(state: T_state, cmd: T_command): T_state
  get_visible_state(state: T_state, player_id: string): unknown
  get_replay_state?(state: T_state): unknown
  is_game_over(state: T_state): boolean
  get_scores(state: T_state): Map<string, number>
}
