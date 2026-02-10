export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A'

export interface Card {
  suit: Suit
  rank: Rank
  id: string
}

export interface Joker {
  suit: 'joker'
  rank: 'joker'
  id: string
}

export type Game_card = Card | Joker

export enum Direction {
  CLOCKWISE = 1,
  COUNTER_CLOCKWISE = -1,
}

export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'] as const
export const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const

export function create_deck(): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank, id: `${suit}-${rank}` })
    }
  }
  return cards
}

export function create_deck_with_jokers(count: number): Game_card[] {
  const cards: Game_card[] = create_deck()
  for (let i = 0; i < count; i++) {
    cards.push({ suit: 'joker', rank: 'joker', id: `joker-${i}` })
  }
  return cards
}

export function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

export const ODD_RANK_VALUES = new Set([3, 5, 7, 9])

/** Find the effective top card, skipping 3s (invisible). */
export function effective_top_card(pile: Card[]): Card | undefined {
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i].rank !== '3') {
      return pile[i]
    }
  }
  return undefined
}

export function can_play_on(card: Card, pile: Card[]): boolean {
  // 2 can always be played (reset)
  if (card.rank === '2') return true
  // 3 can always be played (invisible)
  if (card.rank === '3') return true
  // 10 can always be played (burns)
  if (card.rank === '10') return true

  const top = effective_top_card(pile)
  if (!top) return true

  // If effective top is a 7, must play rank ≤ 7
  if (top.rank === '7') {
    return RANK_VALUES[card.rank] <= 7
  }

  // If effective top is a 9, must play odd rank (3,5,7,9)
  if (top.rank === '9') {
    return ODD_RANK_VALUES.has(RANK_VALUES[card.rank])
  }

  // Otherwise play equal or higher
  return RANK_VALUES[card.rank] >= RANK_VALUES[top.rank]
}
