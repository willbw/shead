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

// Available globally in Node 19+ and all modern browsers
declare const crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T }

/** Return a uniform random integer in [0, upper_bound) with no modulo bias. */
function random_below(upper_bound: number): number {
  const max = 0x100000000 // 2^32
  const limit = max - (max % upper_bound) // largest multiple of upper_bound ≤ 2^32
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % upper_bound
  }
}

export function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = random_below(i + 1);
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

/** Gin rummy point values: A=1, face cards=10, others=face value */
export const GIN_RUMMY_POINT_VALUES: Record<Rank, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10,
}

/** Gin rummy rank order for run detection: A=1, 2=2, ..., K=13 */
export const GIN_RANK_ORDER: Record<Rank, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
}

export function sort_cards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank])
}

export interface Rank_rule {
  /** The set of ranks that can be played when this rank is the effective pile top.
   *  If absent, default applies: any rank with value >= this rank's value. */
  playable_on_me?: Set<Rank>

  /** Effect when this rank is played. */
  on_play?: 'burn' | 'skip' | 'reverse' | 'invisible' | null

  /** If true, this rank can always be played regardless of the pile top. */
  always_playable?: boolean
}

export type Ruleset = Partial<Record<Rank, Rank_rule>>

export const DEFAULT_RULESET: Ruleset = {
  '2':  { playable_on_me: new Set(RANKS), always_playable: true },
  '3':  { on_play: 'invisible' },
  '7':  { playable_on_me: new Set(['2', '3', '4', '5', '6', '7', '10'] as Rank[]) },
  '8':  { on_play: 'skip' },
  '9':  { playable_on_me: new Set(['3', '5', '7', '9'] as Rank[]) },
  '10': { on_play: 'burn', always_playable: true },
  'Q':  { on_play: 'reverse' },
}

/** Find the effective top card, skipping ranks with 'invisible' on_play. */
export function effective_top_card(pile: Card[], ruleset: Ruleset = DEFAULT_RULESET): Card | undefined {
  for (let i = pile.length - 1; i >= 0; i--) {
    if (ruleset[pile[i].rank]?.on_play !== 'invisible') {
      return pile[i]
    }
  }
  return undefined
}

export function can_play_on(card: Card, pile: Card[], ruleset: Ruleset = DEFAULT_RULESET): boolean {
  // Invisible cards can always be played (they pass through to the card below)
  if (ruleset[card.rank]?.on_play === 'invisible') return true

  const top = effective_top_card(pile, ruleset)
  if (!top) return true

  const top_rule = ruleset[top.rank]
  // If the pile top explicitly declares which ranks can be played on it, use that
  if (top_rule?.playable_on_me) {
    return top_rule.playable_on_me.has(card.rank)
  }

  // Always-playable cards (e.g. 2 resets pile, 10 burns pile)
  if (ruleset[card.rank]?.always_playable) return true

  // Default: play equal or higher
  return RANK_VALUES[card.rank] >= RANK_VALUES[top.rank]
}
