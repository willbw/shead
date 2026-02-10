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
