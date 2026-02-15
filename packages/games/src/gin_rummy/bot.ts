import type { Base_command, Bot_difficulty, Card } from '@shead/shared'
import { GIN_RUMMY_POINT_VALUES } from '@shead/shared'
import type { Gin_rummy_state, Gin_rummy_command } from './types'
import { find_optimal_melds, calculate_deadwood_points, is_valid_meld } from './melds'

/** Compute bot commands for gin rummy. Easy: greedy strategy. */
export function compute_gin_rummy_bot_commands(
  state_raw: unknown,
  player_id: string,
  _difficulty: Bot_difficulty,
): Base_command[] {
  const state = state_raw as Gin_rummy_state
  const ps = state.players.get(player_id)
  if (!ps) return []
  if (state.current_player !== player_id) return []

  const commands: Gin_rummy_command[] = []

  if (state.phase === 'first_draw') {
    // Check if taking the discard card would help form melds
    if (state.discard_pile.length > 0) {
      const top = state.discard_pile[state.discard_pile.length - 1]
      const with_card = [...ps.hand, top]
      const current_dw = find_optimal_melds(ps.hand).deadwood
      const new_dw = find_optimal_melds(with_card).deadwood
      if (calculate_deadwood_points(new_dw) < calculate_deadwood_points(current_dw)) {
        commands.push({ player_id, type: 'DRAW_DISCARD' })
        return commands
      }
    }
    commands.push({ player_id, type: 'PASS_FIRST_DRAW' })
    return commands
  }

  if (state.phase === 'draw') {
    // Check if discard top helps
    if (state.discard_pile.length > 0) {
      const top = state.discard_pile[state.discard_pile.length - 1]
      const with_card = [...ps.hand, top]
      const current_dw = find_optimal_melds(ps.hand).deadwood
      const new_dw = find_optimal_melds(with_card).deadwood
      if (calculate_deadwood_points(new_dw) < calculate_deadwood_points(current_dw)) {
        commands.push({ player_id, type: 'DRAW_DISCARD' })
        return commands
      }
    }
    commands.push({ player_id, type: 'DRAW_STOCK' })
    return commands
  }

  if (state.phase === 'discard') {
    const { melds, deadwood } = find_optimal_melds(ps.hand)
    const dw_points = calculate_deadwood_points(deadwood)

    // Check for gin
    if (dw_points === 0) {
      commands.push({
        player_id,
        type: 'GIN',
        melds: melds.map(m => m.map(c => c.id)),
      })
      return commands
    }

    // Check for knock (deadwood <= 10)
    // But we need to discard one card first conceptually — try each deadwood card
    for (const dw_card of deadwood) {
      const hand_without = ps.hand.filter(c => c.id !== dw_card.id)
      const result = find_optimal_melds(hand_without)
      const remaining_dw = calculate_deadwood_points(result.deadwood)
      if (remaining_dw <= 10) {
        // Can knock after discarding this card — but knock doesn't discard.
        // Knock is done with 11 cards. So check if current deadwood <= 10 with melds.
        // We need melds that, combined with discard of exactly 1 card, leave deadwood <= 10
        // Actually knock happens instead of discard. Player has 11 cards and declares melds.
        // So we should check: among all possible discard choices, find one where
        // the remaining 10 cards have optimal deadwood <= 10
        break
      }
    }

    // More correct knock check: player has 11 cards, check if we can form melds leaving <=10 deadwood
    // Actually the knock command uses all 11 cards and declares melds from them.
    // Deadwood = non-meld cards. If total deadwood <= 10, can knock.
    if (dw_points <= 10) {
      commands.push({
        player_id,
        type: 'KNOCK',
        melds: melds.map(m => m.map(c => c.id)),
      })
      return commands
    }

    // Otherwise discard the highest deadwood card that wasn't just drawn from discard
    const sortable = [...deadwood].sort(
      (a, b) => GIN_RUMMY_POINT_VALUES[b.rank] - GIN_RUMMY_POINT_VALUES[a.rank],
    )
    for (const card of sortable) {
      if (card.id !== state.last_drawn_from_discard_id) {
        commands.push({ player_id, type: 'DISCARD', card_id: card.id })
        return commands
      }
    }
    // If all deadwood was drawn from discard (shouldn't happen normally), discard any valid card
    for (const card of ps.hand) {
      if (card.id !== state.last_drawn_from_discard_id) {
        commands.push({ player_id, type: 'DISCARD', card_id: card.id })
        return commands
      }
    }
    return commands
  }

  if (state.phase === 'knock_response') {
    // Try to lay off cards onto knocker's melds
    if (state.knocker_melds) {
      for (let meld_idx = 0; meld_idx < state.knocker_melds.length; meld_idx++) {
        const meld = state.knocker_melds[meld_idx]
        for (const card of ps.hand) {
          const extended = [...meld, card]
          if (is_valid_meld(extended)) {
            commands.push({
              player_id,
              type: 'LAY_OFF',
              card_ids: [card.id],
              meld_index: meld_idx,
            })
            return commands // return one at a time, bot controller will call again
          }
        }
      }
    }
    // No more layoffs possible
    commands.push({ player_id, type: 'ACCEPT_KNOCK' })
    return commands
  }

  if (state.phase === 'round_over') {
    commands.push({ player_id, type: 'NEXT_ROUND' })
    return commands
  }

  return commands
}
