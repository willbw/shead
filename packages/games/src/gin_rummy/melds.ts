import type { Card, Suit, Rank } from '@shead/shared'
import { GIN_RUMMY_POINT_VALUES, GIN_RANK_ORDER, SUITS } from '@shead/shared'

/** Check if cards form a valid set (3-4 same rank, different suits) */
export function is_valid_set(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > 4) return false
  const rank = cards[0].rank
  if (!cards.every(c => c.rank === rank)) return false
  const suits = new Set(cards.map(c => c.suit))
  return suits.size === cards.length
}

/** Check if cards form a valid run (3+ consecutive same suit, ace is low) */
export function is_valid_run(cards: Card[]): boolean {
  if (cards.length < 3) return false
  const suit = cards[0].suit
  if (!cards.every(c => c.suit === suit)) return false
  const orders = cards.map(c => GIN_RANK_ORDER[c.rank]).sort((a, b) => a - b)
  for (let i = 1; i < orders.length; i++) {
    if (orders[i] !== orders[i - 1] + 1) return false
  }
  return true
}

/** Check if cards form a valid meld (set or run) */
export function is_valid_meld(cards: Card[]): boolean {
  return is_valid_set(cards) || is_valid_run(cards)
}

/** Calculate deadwood points for a set of cards */
export function calculate_deadwood_points(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + GIN_RUMMY_POINT_VALUES[c.rank], 0)
}

/** Validate a player's proposed meld arrangement against their hand.
 *  Returns the deadwood cards (cards not in any meld) or null if invalid. */
export function validate_meld_arrangement(hand: Card[], melds: string[][]): { valid: true; deadwood: Card[] } | { valid: false; reason: string } {
  const hand_map = new Map(hand.map(c => [c.id, c]))
  const used_ids = new Set<string>()

  for (let i = 0; i < melds.length; i++) {
    const meld_ids = melds[i]
    if (meld_ids.length < 3) {
      return { valid: false, reason: `Meld ${i + 1} has fewer than 3 cards` }
    }

    const meld_cards: Card[] = []
    for (const id of meld_ids) {
      if (used_ids.has(id)) {
        return { valid: false, reason: `Card ${id} used in multiple melds` }
      }
      const card = hand_map.get(id)
      if (!card) {
        return { valid: false, reason: `Card ${id} not in hand` }
      }
      used_ids.add(id)
      meld_cards.push(card)
    }

    if (!is_valid_meld(meld_cards)) {
      return { valid: false, reason: `Meld ${i + 1} is not a valid set or run` }
    }
  }

  const deadwood = hand.filter(c => !used_ids.has(c.id))
  return { valid: true, deadwood }
}

/** Check if a card can extend an existing meld */
export function can_lay_off(card: Card, meld: Card[]): boolean {
  // Try adding the card and see if it's still a valid meld
  const extended = [...meld, card]
  return is_valid_meld(extended)
}

/** Find all possible sets from a hand */
function find_all_sets(hand: Card[]): Card[][] {
  const by_rank = new Map<Rank, Card[]>()
  for (const c of hand) {
    const arr = by_rank.get(c.rank) ?? []
    arr.push(c)
    by_rank.set(c.rank, arr)
  }

  const results: Card[][] = []
  for (const [, cards] of by_rank) {
    if (cards.length >= 3) {
      // Add all combinations of 3 from these cards
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          for (let k = j + 1; k < cards.length; k++) {
            results.push([cards[i], cards[j], cards[k]])
          }
        }
      }
      // Add combinations of 4 if possible
      if (cards.length === 4) {
        results.push([...cards])
      }
    }
  }
  return results
}

/** Find all possible runs from a hand */
function find_all_runs(hand: Card[]): Card[][] {
  const by_suit = new Map<Suit, Card[]>()
  for (const c of hand) {
    const arr = by_suit.get(c.suit) ?? []
    arr.push(c)
    by_suit.set(c.suit, arr)
  }

  const results: Card[][] = []
  for (const [, cards] of by_suit) {
    if (cards.length < 3) continue
    // Sort by rank order
    const sorted = [...cards].sort((a, b) => GIN_RANK_ORDER[a.rank] - GIN_RANK_ORDER[b.rank])

    // Find all consecutive sequences of 3+
    for (let start = 0; start < sorted.length; start++) {
      const run = [sorted[start]]
      for (let next = start + 1; next < sorted.length; next++) {
        if (GIN_RANK_ORDER[sorted[next].rank] === GIN_RANK_ORDER[run[run.length - 1].rank] + 1) {
          run.push(sorted[next])
          if (run.length >= 3) {
            results.push([...run])
          }
        } else {
          break
        }
      }
    }
  }
  return results
}

/** Find the optimal meld arrangement that minimizes deadwood.
 *  Uses backtracking over all possible melds. */
export function find_optimal_melds(hand: Card[]): { melds: Card[][]; deadwood: Card[] } {
  const all_melds = [...find_all_sets(hand), ...find_all_runs(hand)]

  let best_deadwood_points = calculate_deadwood_points(hand)
  let best_melds: Card[][] = []

  function backtrack(index: number, used_ids: Set<string>, current_melds: Card[][]): void {
    // Calculate current deadwood
    const remaining = hand.filter(c => !used_ids.has(c.id))
    const dw = calculate_deadwood_points(remaining)
    if (dw < best_deadwood_points) {
      best_deadwood_points = dw
      best_melds = current_melds.map(m => [...m])
    }

    if (dw === 0) return // can't do better

    for (let i = index; i < all_melds.length; i++) {
      const meld = all_melds[i]
      // Check no overlap with used cards
      if (meld.some(c => used_ids.has(c.id))) continue

      // Use this meld
      for (const c of meld) used_ids.add(c.id)
      current_melds.push(meld)

      backtrack(i + 1, used_ids, current_melds)

      // Undo
      current_melds.pop()
      for (const c of meld) used_ids.delete(c.id)
    }
  }

  backtrack(0, new Set(), [])

  const used = new Set(best_melds.flatMap(m => m.map(c => c.id)))
  const deadwood = hand.filter(c => !used.has(c.id))
  return { melds: best_melds, deadwood }
}
