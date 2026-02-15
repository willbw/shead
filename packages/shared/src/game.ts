export type Base_command = {
  player_id: string
}

export type Validation_result =
  | { valid: true }
  | { valid: false; reason: string }

export type Bot_difficulty = 'easy' | 'medium' | 'hard'
