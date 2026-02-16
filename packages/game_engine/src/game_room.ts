import type { Base_command, Player, Validation_result } from '@shead/shared'
import type { Card_game_definition } from './card_game_definition'

export type Game_room_status = 'waiting' | 'in_progress' | 'finished'

export type Room_event =
  | { type: 'state_changed' }
  | { type: 'game_over'; scores: Map<string, number> }
  | { type: 'player_joined'; player: Player }
  | { type: 'player_left'; player_id: string }

export type Room_listener = (event: Room_event) => void

export class Game_room<
  T_state,
  T_command extends Base_command,
  T_config,
> {
  readonly id: string
  readonly definition: Card_game_definition<T_state, T_command, T_config>
  private config: T_config
  private players: Map<string, Player> = new Map()
  private state: T_state | null = null
  private status: Game_room_status = 'waiting'
  private listeners: Room_listener[] = []
  private replay_enabled: boolean = false
  private replay_snapshots: T_state[] = []

  constructor(
    id: string,
    definition: Card_game_definition<T_state, T_command, T_config>,
    config: T_config,
  ) {
    this.id = id
    this.definition = definition
    this.config = config
  }

  get_status(): Game_room_status {
    return this.status
  }

  set_replay_enabled(enabled: boolean): void {
    if (this.status !== 'waiting') return
    this.replay_enabled = enabled
  }

  is_replay_enabled(): boolean {
    return this.replay_enabled
  }

  get_replay_states(): unknown[] {
    if (!this.definition.get_replay_state) {
      return this.replay_snapshots as unknown[]
    }
    return this.replay_snapshots.map((s) => this.definition.get_replay_state!(s))
  }

  get_players(): Player[] {
    return Array.from(this.players.values())
  }

  get_player_count(): number {
    return this.players.size
  }

  add_player(player: Player): Validation_result {
    if (this.status !== 'waiting') {
      return { valid: false, reason: 'Game already in progress' }
    }
    if (this.players.size >= this.definition.max_players) {
      return { valid: false, reason: 'Room is full' }
    }
    if (this.players.has(player.id)) {
      return { valid: false, reason: 'Player already in room' }
    }
    this.players.set(player.id, player)
    this.emit({ type: 'player_joined', player })
    return { valid: true }
  }

  remove_player(player_id: string): Validation_result {
    if (!this.players.has(player_id)) {
      return { valid: false, reason: 'Player not in room' }
    }
    this.players.delete(player_id)
    this.emit({ type: 'player_left', player_id })
    return { valid: true }
  }

  start(): Validation_result {
    if (this.status !== 'waiting') {
      return { valid: false, reason: 'Game already started' }
    }
    if (this.players.size < this.definition.min_players) {
      return { valid: false, reason: `Need at least ${this.definition.min_players} players` }
    }
    this.state = this.definition.initial_state(this.config, this.get_players())
    if (this.replay_enabled) {
      this.replay_snapshots.push(this.state)
    }
    this.status = 'in_progress'
    this.emit({ type: 'state_changed' })
    return { valid: true }
  }

  handle_command(cmd: T_command): Validation_result {
    if (this.status !== 'in_progress' || this.state === null) {
      return { valid: false, reason: 'Game is not in progress' }
    }
    if (!this.players.has(cmd.player_id)) {
      return { valid: false, reason: 'Player not in room' }
    }
    const result = this.definition.validate_command(this.state, cmd)
    if (!result.valid) {
      return result
    }
    this.state = this.definition.apply_command(this.state, cmd)
    if (this.replay_enabled) {
      this.replay_snapshots.push(this.state)
    }
    this.emit({ type: 'state_changed' })
    if (this.definition.is_game_over(this.state)) {
      this.status = 'finished'
      this.emit({ type: 'game_over', scores: this.definition.get_scores(this.state) })
    }
    return { valid: true }
  }

  get_state(): T_state | null {
    return this.state
  }

  /** Debug only — replace internal state directly */
  _debug_set_state(state: T_state): void {
    this.state = state
    this.emit({ type: 'state_changed' })
  }

  _debug_get_state(): T_state | null {
    return this.state
  }

  get_state_for_player(player_id: string): unknown {
    if (this.state === null) {
      return null
    }
    return this.definition.get_visible_state(this.state, player_id)
  }

  on(listener: Room_listener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private emit(event: Room_event): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
