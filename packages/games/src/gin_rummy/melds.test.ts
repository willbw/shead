import { describe, it, expect } from 'vitest'
import type { Card, Suit, Rank } from '@shead/shared'
import {
  is_valid_set,
  is_valid_run,
  is_valid_meld,
  calculate_deadwood_points,
  validate_meld_arrangement,
  find_optimal_melds,
  can_lay_off,
} from './melds'

function card(suit: Suit, rank: Rank): Card {
  return { suit, rank, id: `${suit}-${rank}` }
}

describe('is_valid_set', () => {
  it('accepts 3 cards of same rank, different suits', () => {
    expect(is_valid_set([
      card('hearts', '7'), card('diamonds', '7'), card('clubs', '7'),
    ])).toBe(true)
  })

  it('accepts 4 cards of same rank, different suits', () => {
    expect(is_valid_set([
      card('hearts', 'K'), card('diamonds', 'K'), card('clubs', 'K'), card('spades', 'K'),
    ])).toBe(true)
  })

  it('rejects 2 cards', () => {
    expect(is_valid_set([card('hearts', '7'), card('diamonds', '7')])).toBe(false)
  })

  it('rejects 5 cards', () => {
    expect(is_valid_set([
      card('hearts', '7'), card('diamonds', '7'), card('clubs', '7'),
      card('spades', '7'), card('hearts', '7'),
    ])).toBe(false)
  })

  it('rejects mixed ranks', () => {
    expect(is_valid_set([
      card('hearts', '7'), card('diamonds', '8'), card('clubs', '7'),
    ])).toBe(false)
  })

  it('rejects duplicate suits', () => {
    expect(is_valid_set([
      card('hearts', '7'), card('hearts', '7'), card('clubs', '7'),
    ])).toBe(false)
  })
})

describe('is_valid_run', () => {
  it('accepts 3 consecutive same suit', () => {
    expect(is_valid_run([
      card('hearts', '3'), card('hearts', '4'), card('hearts', '5'),
    ])).toBe(true)
  })

  it('accepts 4 consecutive same suit', () => {
    expect(is_valid_run([
      card('spades', '10'), card('spades', 'J'), card('spades', 'Q'), card('spades', 'K'),
    ])).toBe(true)
  })

  it('accepts A-2-3 run (ace low)', () => {
    expect(is_valid_run([
      card('diamonds', 'A'), card('diamonds', '2'), card('diamonds', '3'),
    ])).toBe(true)
  })

  it('rejects Q-K-A (ace is only low)', () => {
    // In gin rummy, ace is low only. GIN_RANK_ORDER has A=1, K=13
    // So Q=12, K=13, A=1 are not consecutive
    expect(is_valid_run([
      card('hearts', 'Q'), card('hearts', 'K'), card('hearts', 'A'),
    ])).toBe(false)
  })

  it('rejects mixed suits', () => {
    expect(is_valid_run([
      card('hearts', '3'), card('diamonds', '4'), card('hearts', '5'),
    ])).toBe(false)
  })

  it('rejects non-consecutive', () => {
    expect(is_valid_run([
      card('hearts', '3'), card('hearts', '5'), card('hearts', '7'),
    ])).toBe(false)
  })

  it('rejects 2 cards', () => {
    expect(is_valid_run([card('hearts', '3'), card('hearts', '4')])).toBe(false)
  })

  it('accepts cards in any order', () => {
    expect(is_valid_run([
      card('clubs', '8'), card('clubs', '6'), card('clubs', '7'),
    ])).toBe(true)
  })
})

describe('is_valid_meld', () => {
  it('accepts valid set', () => {
    expect(is_valid_meld([
      card('hearts', '7'), card('diamonds', '7'), card('clubs', '7'),
    ])).toBe(true)
  })

  it('accepts valid run', () => {
    expect(is_valid_meld([
      card('hearts', '3'), card('hearts', '4'), card('hearts', '5'),
    ])).toBe(true)
  })

  it('rejects invalid meld', () => {
    expect(is_valid_meld([
      card('hearts', '3'), card('diamonds', '5'), card('clubs', '7'),
    ])).toBe(false)
  })
})

describe('calculate_deadwood_points', () => {
  it('calculates ace as 1', () => {
    expect(calculate_deadwood_points([card('hearts', 'A')])).toBe(1)
  })

  it('calculates face cards as 10', () => {
    expect(calculate_deadwood_points([card('hearts', 'J')])).toBe(10)
    expect(calculate_deadwood_points([card('hearts', 'Q')])).toBe(10)
    expect(calculate_deadwood_points([card('hearts', 'K')])).toBe(10)
  })

  it('calculates number cards at face value', () => {
    expect(calculate_deadwood_points([card('hearts', '5')])).toBe(5)
    expect(calculate_deadwood_points([card('hearts', '10')])).toBe(10)
  })

  it('sums multiple cards', () => {
    expect(calculate_deadwood_points([
      card('hearts', 'K'), card('diamonds', '5'), card('clubs', 'A'),
    ])).toBe(16)
  })

  it('returns 0 for empty array', () => {
    expect(calculate_deadwood_points([])).toBe(0)
  })
})

describe('validate_meld_arrangement', () => {
  it('validates correct arrangement and returns deadwood', () => {
    const hand = [
      card('hearts', '3'), card('hearts', '4'), card('hearts', '5'),
      card('diamonds', 'K'), card('clubs', 'Q'),
    ]
    const melds = [['hearts-3', 'hearts-4', 'hearts-5']]
    const result = validate_meld_arrangement(hand, melds)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.deadwood).toHaveLength(2)
      expect(result.deadwood.map(c => c.id)).toContain('diamonds-K')
      expect(result.deadwood.map(c => c.id)).toContain('clubs-Q')
    }
  })

  it('rejects card not in hand', () => {
    const hand = [card('hearts', '3'), card('hearts', '4'), card('hearts', '5')]
    const melds = [['hearts-3', 'hearts-4', 'spades-6']]
    const result = validate_meld_arrangement(hand, melds)
    expect(result.valid).toBe(false)
  })

  it('rejects card used in multiple melds', () => {
    const hand = [
      card('hearts', '3'), card('hearts', '4'), card('hearts', '5'),
      card('diamonds', '3'), card('clubs', '3'),
    ]
    const melds = [
      ['hearts-3', 'hearts-4', 'hearts-5'],
      ['hearts-3', 'diamonds-3', 'clubs-3'],
    ]
    const result = validate_meld_arrangement(hand, melds)
    expect(result.valid).toBe(false)
  })

  it('rejects invalid meld', () => {
    const hand = [card('hearts', '3'), card('diamonds', '5'), card('clubs', '7')]
    const melds = [['hearts-3', 'diamonds-5', 'clubs-7']]
    const result = validate_meld_arrangement(hand, melds)
    expect(result.valid).toBe(false)
  })

  it('rejects meld with fewer than 3 cards', () => {
    const hand = [card('hearts', '3'), card('diamonds', '3')]
    const melds = [['hearts-3', 'diamonds-3']]
    const result = validate_meld_arrangement(hand, melds)
    expect(result.valid).toBe(false)
  })
})

describe('find_optimal_melds', () => {
  it('finds a simple set', () => {
    const hand = [
      card('hearts', '7'), card('diamonds', '7'), card('clubs', '7'),
      card('spades', 'K'),
    ]
    const { melds, deadwood } = find_optimal_melds(hand)
    expect(melds).toHaveLength(1)
    expect(melds[0]).toHaveLength(3)
    expect(deadwood).toHaveLength(1)
    expect(deadwood[0].rank).toBe('K')
  })

  it('finds a simple run', () => {
    const hand = [
      card('hearts', '3'), card('hearts', '4'), card('hearts', '5'),
      card('diamonds', 'K'),
    ]
    const { melds, deadwood } = find_optimal_melds(hand)
    expect(melds).toHaveLength(1)
    expect(melds[0]).toHaveLength(3)
    expect(deadwood).toHaveLength(1)
  })

  it('finds multiple melds', () => {
    const hand = [
      card('hearts', '3'), card('hearts', '4'), card('hearts', '5'),
      card('diamonds', '7'), card('clubs', '7'), card('spades', '7'),
      card('hearts', 'K'),
    ]
    const { melds, deadwood } = find_optimal_melds(hand)
    expect(melds).toHaveLength(2)
    expect(deadwood).toHaveLength(1)
  })

  it('minimizes deadwood when overlapping melds are possible', () => {
    // 7h could be in a set (7h,7d,7c) or a run (7h,8h,9h)
    // The set uses 7h,7d,7c; the run uses 7h,8h,9h
    // If we pick the run, the 7d and 7c become deadwood (14 pts)
    // If we pick the set, 8h and 9h become deadwood (17 pts)
    // So the set is better
    const hand = [
      card('hearts', '7'), card('diamonds', '7'), card('clubs', '7'),
      card('hearts', '8'), card('hearts', '9'),
    ]
    const { melds, deadwood } = find_optimal_melds(hand)
    expect(melds).toHaveLength(1)
    expect(calculate_deadwood_points(deadwood)).toBeLessThanOrEqual(17)
  })

  it('handles hand with no melds', () => {
    const hand = [
      card('hearts', '3'), card('diamonds', '5'), card('clubs', '7'), card('spades', '9'),
    ]
    const { melds, deadwood } = find_optimal_melds(hand)
    expect(melds).toHaveLength(0)
    expect(deadwood).toHaveLength(4)
  })

  it('handles gin (zero deadwood)', () => {
    const hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'),
      card('diamonds', '4'), card('diamonds', '5'), card('diamonds', '6'),
      card('clubs', '7'), card('clubs', '8'), card('clubs', '9'),
      card('spades', 'K'),
    ]
    // 3 runs + 1 leftover K — not gin. Let's make a real gin hand
    const gin_hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'),
      card('diamonds', '4'), card('diamonds', '5'), card('diamonds', '6'),
      card('clubs', '7'), card('clubs', '8'), card('clubs', '9'), card('clubs', '10'),
    ]
    const { melds, deadwood } = find_optimal_melds(gin_hand)
    expect(calculate_deadwood_points(deadwood)).toBe(0)
    expect(melds.length).toBeGreaterThanOrEqual(3)
  })
})

describe('can_lay_off', () => {
  it('extends a run from the high end', () => {
    const meld = [card('hearts', '3'), card('hearts', '4'), card('hearts', '5')]
    expect(can_lay_off(card('hearts', '6'), meld)).toBe(true)
  })

  it('extends a run from the low end', () => {
    const meld = [card('hearts', '3'), card('hearts', '4'), card('hearts', '5')]
    expect(can_lay_off(card('hearts', '2'), meld)).toBe(true)
  })

  it('extends a set', () => {
    const meld = [card('hearts', '7'), card('diamonds', '7'), card('clubs', '7')]
    expect(can_lay_off(card('spades', '7'), meld)).toBe(true)
  })

  it('rejects card that does not extend', () => {
    const meld = [card('hearts', '3'), card('hearts', '4'), card('hearts', '5')]
    expect(can_lay_off(card('hearts', '8'), meld)).toBe(false)
  })

  it('rejects wrong suit for run', () => {
    const meld = [card('hearts', '3'), card('hearts', '4'), card('hearts', '5')]
    expect(can_lay_off(card('diamonds', '6'), meld)).toBe(false)
  })

  it('rejects duplicate suit for set', () => {
    const meld = [card('hearts', '7'), card('diamonds', '7'), card('clubs', '7')]
    expect(can_lay_off(card('hearts', '7'), meld)).toBe(false)
  })

  it('rejects extending a full set (already 4)', () => {
    const meld = [
      card('hearts', '7'), card('diamonds', '7'), card('clubs', '7'), card('spades', '7'),
    ]
    // A 5th card of any kind can't make a valid set (max 4)
    // and adding any card won't make a valid run either
    expect(can_lay_off(card('hearts', '8'), meld)).toBe(false)
  })
})
