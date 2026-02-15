import type { Card, Rank } from '@shead/shared'
import { RANK_VALUES, can_play_on } from '@shead/shared'
import type { Shithead_state, Shithead_command } from './types'

/** Priority for face-up card selection during swap phase.
 *  Lower number = better to have face-up (want strong cards face-up).
 *  10 and 2 are best (always playable / special), then A, K, etc. */
export const SWAP_PRIORITY: Record<Rank, number> = {
  '3': 0, '10': 1, '2': 2, 'A': 3, 'K': 4, 'Q': 5, 'J': 6,
  '9': 7, '8': 8, '7': 9, '6': 10, '5': 11, '4': 12,
}

export function is_bot_player(player_id: string): boolean {
  return player_id.startsWith('bot-')
}

function get_playable_source(player_state: { hand: Card[]; face_up: Card[]; face_down: Card[] }):
  'hand' | 'face_up' | 'face_down' {
  if (player_state.hand.length > 0) return 'hand'
  if (player_state.face_up.length > 0) return 'face_up'
  return 'face_down'
}

/** Compute swap commands + READY for the swap phase. */
export function compute_swap_commands(
  player_id: string,
  hand: Card[],
  face_up: Card[],
): Shithead_command[] {
  const commands: Shithead_command[] = []
  const current_hand = [...hand]
  const current_face_up = [...face_up]

  // Greedily swap: if any hand card has better (lower) priority than any face-up card, swap them
  let swapped = true
  while (swapped) {
    swapped = false
    // Find worst face-up card (highest priority number)
    let worst_fu_idx = -1
    let worst_fu_priority = -1
    for (let i = 0; i < current_face_up.length; i++) {
      const p = SWAP_PRIORITY[current_face_up[i].rank]
      if (p > worst_fu_priority) {
        worst_fu_priority = p
        worst_fu_idx = i
      }
    }
    // Find best hand card (lowest priority number)
    let best_hand_idx = -1
    let best_hand_priority = Infinity
    for (let i = 0; i < current_hand.length; i++) {
      const p = SWAP_PRIORITY[current_hand[i].rank]
      if (p < best_hand_priority) {
        best_hand_priority = p
        best_hand_idx = i
      }
    }

    if (worst_fu_idx >= 0 && best_hand_idx >= 0 && best_hand_priority < worst_fu_priority) {
      commands.push({
        player_id,
        type: 'SWAP_CARD',
        hand_card_id: current_hand[best_hand_idx].id,
        face_up_card_id: current_face_up[worst_fu_idx].id,
      })
      // Simulate the swap
      const temp = current_hand[best_hand_idx]
      current_hand[best_hand_idx] = current_face_up[worst_fu_idx]
      current_face_up[worst_fu_idx] = temp
      swapped = true
    }
  }

  commands.push({ player_id, type: 'READY' })
  return commands
}

/** Compute a single play-phase command for the bot. */
export function compute_play_command(
  state: Shithead_state,
  player_id: string,
): Shithead_command {
  const ps = state.players.get(player_id)!
  const source = get_playable_source(ps)

  // Face-down: must play blind, always index 0
  if (source === 'face_down') {
    return { player_id, type: 'PLAY_FACE_DOWN', index: 0 }
  }

  const available = source === 'hand' ? ps.hand : ps.face_up

  // Find all playable cards
  const playable = available.filter((c) => can_play_on(c, state.discard_pile))

  if (playable.length === 0) {
    return { player_id, type: 'PICK_UP_PILE' }
  }

  // Check for four-of-a-kind completion opportunity
  const pile = state.discard_pile
  if (pile.length > 0) {
    const top_rank = pile[pile.length - 1].rank
    // Count how many of that rank are on top of pile consecutively
    let pile_count = 0
    for (let i = pile.length - 1; i >= 0; i--) {
      if (pile[i].rank === top_rank) pile_count++
      else break
    }
    // Count how many matching cards we have that are playable
    const matching = playable.filter((c) => c.rank === top_rank)
    if (matching.length > 0 && pile_count + matching.length >= 4) {
      return {
        player_id,
        type: 'PLAY_CARD',
        card_ids: matching.map((c) => c.id),
      }
    }
  }

  // Sort playable by rank value ascending, play lowest rank including all duplicates
  playable.sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank])
  const lowest_rank = playable[0].rank
  const to_play = playable.filter((c) => c.rank === lowest_rank)

  return {
    player_id,
    type: 'PLAY_CARD',
    card_ids: to_play.map((c) => c.id),
  }
}

/** Compute all bot commands for the current game state.
 *  In swap phase: returns swap commands + READY.
 *  In play phase: returns a single play command. */
export function compute_bot_commands(
  state: Shithead_state,
  player_id: string,
): Shithead_command[] {
  if (state.phase === 'swap') {
    if (state.ready_players.has(player_id)) return []
    const ps = state.players.get(player_id)!
    return compute_swap_commands(player_id, ps.hand, ps.face_up)
  }

  if (state.phase === 'play') {
    const current = state.player_order[state.current_player_index]
    if (current !== player_id) return []
    return [compute_play_command(state, player_id)]
  }

  return []
}
