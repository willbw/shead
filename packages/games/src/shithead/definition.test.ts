import { describe, it, expect } from 'vitest'
import type { Card, Player, Rank } from '@shead/shared'
import { RANKS, SUITS, Direction } from '@shead/shared'
import { shithead_definition } from './definition'
import type { Shithead_command, Shithead_state, Visible_shithead_state } from './types'
import { DEFAULT_SHITHEAD_CONFIG } from './types'

const PLAYERS: Player[] = [
  { id: 'p1', name: 'Alice', connected: true },
  { id: 'p2', name: 'Bob', connected: true },
]

const THREE_PLAYERS: Player[] = [
  ...PLAYERS,
  { id: 'p3', name: 'Charlie', connected: true },
]

function make_card(suit: string, rank: string): Card {
  return { suit: suit as Card['suit'], rank: rank as Card['rank'], id: `${suit}-${rank}` }
}

/** Create a deterministic deck with a known order for testing */
function create_ordered_deck(): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank, id: `${suit}-${rank}` })
    }
  }
  return cards
}

/** Create a game state with a known deck (bypasses shuffle) */
function create_test_game(
  players: Player[],
  deck?: Card[],
): Shithead_state {
  const state = shithead_definition.initial_state(DEFAULT_SHITHEAD_CONFIG, players)
  if (deck) {
    // Re-deal with the deterministic deck
    return deal_deterministic(deck, players)
  }
  return state
}

function deal_deterministic(deck: Card[], players: Player[]): Shithead_state {
  const cfg = DEFAULT_SHITHEAD_CONFIG
  const player_map = new Map<string, { hand: Card[]; face_up: Card[]; face_down: Card[] }>()
  let idx = 0

  for (const player of players) {
    const face_down = deck.slice(idx, idx + cfg.num_face_down)
    idx += cfg.num_face_down
    const face_up = deck.slice(idx, idx + cfg.num_face_up)
    idx += cfg.num_face_up
    const hand = deck.slice(idx, idx + cfg.num_hand)
    idx += cfg.num_hand
    player_map.set(player.id, { hand, face_up, face_down })
  }

  return {
    deck: deck.slice(idx),
    discard_pile: [],
    players: player_map,
    player_order: players.map((p) => p.id),
    current_player_index: 0,
    direction: Direction.CLOCKWISE,
    phase: 'swap',
    ready_players: new Set(),
    last_effect: null,
    last_revealed_card: null,
  }
}

function ready_all(state: Shithead_state): Shithead_state {
  let s = state
  for (const id of s.player_order) {
    s = shithead_definition.apply_command(s, { player_id: id, type: 'READY' })
  }
  return s
}

function apply(state: Shithead_state, cmd: Shithead_command): Shithead_state {
  const result = shithead_definition.validate_command(state, cmd)
  expect(result.valid, `Expected command to be valid but got: ${!result.valid ? result.reason : ''}`).toBe(true)
  return shithead_definition.apply_command(state, cmd)
}

function expect_invalid(state: Shithead_state, cmd: Shithead_command, reason?: string): void {
  const result = shithead_definition.validate_command(state, cmd)
  expect(result.valid).toBe(false)
  if (reason && !result.valid) {
    expect(result.reason).toContain(reason)
  }
}

describe('shithead_definition', () => {
  describe('metadata', () => {
    it('has correct id and name', () => {
      expect(shithead_definition.id).toBe('shithead')
      expect(shithead_definition.name).toBe('Shithead')
    })

    it('supports 2-5 players', () => {
      expect(shithead_definition.min_players).toBe(2)
      expect(shithead_definition.max_players).toBe(5)
    })
  })

  describe('initial_state', () => {
    it('deals correct number of cards to each player', () => {
      const state = create_test_game(PLAYERS)
      for (const [, ps] of state.players) {
        expect(ps.face_down).toHaveLength(3)
        expect(ps.face_up).toHaveLength(3)
        expect(ps.hand).toHaveLength(3)
      }
    })

    it('starts in swap phase', () => {
      const state = create_test_game(PLAYERS)
      expect(state.phase).toBe('swap')
    })

    it('has correct deck size after dealing', () => {
      const state = create_test_game(PLAYERS)
      // 52 - (2 players * 9 cards) = 34
      expect(state.deck.length + state.players.size * 9).toBe(52)
      expect(state.deck).toHaveLength(34)
    })

    it('deals correct deck size for 3 players', () => {
      const state = create_test_game(THREE_PLAYERS)
      // 52 - (3 * 9) = 25
      expect(state.deck).toHaveLength(25)
    })

    it('starts with empty discard pile', () => {
      const state = create_test_game(PLAYERS)
      expect(state.discard_pile).toHaveLength(0)
    })

    it('no cards are duplicated', () => {
      const state = create_test_game(PLAYERS)
      const all_ids = new Set<string>()
      for (const [, ps] of state.players) {
        for (const c of [...ps.hand, ...ps.face_up, ...ps.face_down]) {
          expect(all_ids.has(c.id)).toBe(false)
          all_ids.add(c.id)
        }
      }
      for (const c of state.deck) {
        expect(all_ids.has(c.id)).toBe(false)
        all_ids.add(c.id)
      }
      expect(all_ids.size).toBe(52)
    })
  })

  describe('swap phase', () => {
    it('allows swapping a hand card with a face-up card', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)

      const p1 = state.players.get('p1')!
      const hand_card = p1.hand[0]
      const face_up_card = p1.face_up[0]

      const next = apply(state, {
        player_id: 'p1',
        type: 'SWAP_CARD',
        hand_card_id: hand_card.id,
        face_up_card_id: face_up_card.id,
      })

      const p1_next = next.players.get('p1')!
      expect(p1_next.hand).toContainEqual(face_up_card)
      expect(p1_next.face_up).toContainEqual(hand_card)
    })

    it('rejects swapping card not in hand', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const p1 = state.players.get('p1')!

      expect_invalid(state, {
        player_id: 'p1',
        type: 'SWAP_CARD',
        hand_card_id: 'nonexistent',
        face_up_card_id: p1.face_up[0].id,
      }, 'Card not in hand')
    })

    it('rejects swapping card not in face-up', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const p1 = state.players.get('p1')!

      expect_invalid(state, {
        player_id: 'p1',
        type: 'SWAP_CARD',
        hand_card_id: p1.hand[0].id,
        face_up_card_id: 'nonexistent',
      }, 'Card not in face-up')
    })

    it('allows any player to swap during swap phase (not turn-based)', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const p2 = state.players.get('p2')!

      // p2 can swap even though it's "p1's turn" index
      const result = shithead_definition.validate_command(state, {
        player_id: 'p2',
        type: 'SWAP_CARD',
        hand_card_id: p2.hand[0].id,
        face_up_card_id: p2.face_up[0].id,
      })
      expect(result.valid).toBe(true)
    })

    it('transitions to play phase when all players ready', () => {
      const state = create_test_game(PLAYERS)
      const s1 = apply(state, { player_id: 'p1', type: 'READY' })
      expect(s1.phase).toBe('swap') // not all ready yet
      const s2 = apply(s1, { player_id: 'p2', type: 'READY' })
      expect(s2.phase).toBe('play')
    })

    it('rejects double ready', () => {
      const state = create_test_game(PLAYERS)
      const s1 = apply(state, { player_id: 'p1', type: 'READY' })
      expect_invalid(s1, { player_id: 'p1', type: 'READY' }, 'Already ready')
    })

    it('allows unready after ready', () => {
      const state = create_test_game(PLAYERS)
      const s1 = apply(state, { player_id: 'p1', type: 'READY' })
      expect(s1.ready_players.has('p1')).toBe(true)

      const s2 = apply(s1, { player_id: 'p1', type: 'UNREADY' })
      expect(s2.ready_players.has('p1')).toBe(false)
      expect(s2.phase).toBe('swap')
    })

    it('rejects unready when not ready', () => {
      const state = create_test_game(PLAYERS)
      expect_invalid(state, { player_id: 'p1', type: 'UNREADY' }, 'Not ready yet')
    })

    it('allows re-ready after unready', () => {
      const state = create_test_game(PLAYERS)
      const s1 = apply(state, { player_id: 'p1', type: 'READY' })
      const s2 = apply(s1, { player_id: 'p1', type: 'UNREADY' })
      const s3 = apply(s2, { player_id: 'p1', type: 'READY' })
      expect(s3.ready_players.has('p1')).toBe(true)
    })

    it('rejects play commands during swap phase', () => {
      const state = create_test_game(PLAYERS)
      expect_invalid(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: ['whatever'],
      }, 'Game has not started')
    })
  })

  describe('play phase — basic play', () => {
    function setup_play_state(): Shithead_state {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      return ready_all(state)
    }

    it('allows current player to play a valid card', () => {
      const state = setup_play_state()
      const p1 = state.players.get('p1')!
      // Empty pile, any card is valid
      const card = p1.hand[0]

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [card.id],
      })

      expect(next.discard_pile).toContainEqual(card)
      expect(next.players.get('p1')!.hand).not.toContainEqual(card)
    })

    it('rejects play from wrong player', () => {
      const state = setup_play_state()
      const p2 = state.players.get('p2')!

      expect_invalid(state, {
        player_id: 'p2',
        type: 'PLAY_CARD',
        card_ids: [p2.hand[0].id],
      }, 'Not your turn')
    })

    it('rejects playing a card not in hand', () => {
      const state = setup_play_state()

      expect_invalid(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: ['nonexistent'],
      }, 'not found')
    })

    it('advances turn after playing', () => {
      const state = setup_play_state()
      const p1 = state.players.get('p1')!
      // Use a non-special card to test basic turn advancement
      p1.hand = [make_card('hearts', '4'), make_card('clubs', 'K'), make_card('spades', 'A')]

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [p1.hand[0].id],
      })

      expect(next.player_order[next.current_player_index]).toBe('p2')
    })

    it('draws from deck after playing from hand when at minimum', () => {
      const state = setup_play_state()
      const p1 = state.players.get('p1')!
      expect(p1.hand).toHaveLength(3) // starts at minimum
      const deck_size_before = state.deck.length

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [p1.hand[0].id],
      })

      // Played 1, drew 1 → hand size stays at 3
      expect(next.players.get('p1')!.hand).toHaveLength(3)
      expect(next.deck).toHaveLength(deck_size_before - 1)
    })

    it('does not draw when hand is above minimum size', () => {
      const state = setup_play_state()
      const p1 = state.players.get('p1')!
      // Give p1 extra cards (simulating having picked up the pile earlier)
      p1.hand.push(make_card('diamonds', '4'), make_card('clubs', '6'))
      expect(p1.hand).toHaveLength(5)
      const deck_size_before = state.deck.length

      // Play a 2 (always playable)
      const two_card = make_card('diamonds', '2')
      p1.hand.push(two_card)
      state.discard_pile.push(make_card('clubs', '5'))

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [two_card.id],
      })

      // Hand shrinks by 1 (6 → 5), no draw from deck since still above 3
      expect(next.players.get('p1')!.hand).toHaveLength(5)
      expect(next.deck).toHaveLength(deck_size_before)
    })

    it('allows playing multiple cards of the same rank', () => {
      // Set up a hand with two cards of the same rank
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const p1 = state.players.get('p1')!

      // Give p1 two 5s in hand
      const five_h = make_card('hearts', '5')
      const five_d = make_card('diamonds', '5')
      p1.hand = [five_h, five_d, make_card('clubs', 'K')]

      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [five_h.id, five_d.id],
      })

      expect(next.discard_pile).toContainEqual(five_h)
      expect(next.discard_pile).toContainEqual(five_d)
    })

    it('rejects playing cards of different ranks', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const p1 = state.players.get('p1')!

      // Give p1 cards of different ranks
      p1.hand = [make_card('hearts', '5'), make_card('diamonds', '8'), make_card('clubs', 'K')]

      const play_state = ready_all(state)

      expect_invalid(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [p1.hand[0].id, p1.hand[1].id],
      }, 'same rank')
    })
  })

  describe('play phase — card rank rules', () => {
    function setup_with_pile_and_hand(
      pile_cards: Card[],
      hand_cards: Card[],
    ): Shithead_state {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      state.discard_pile = pile_cards
      state.players.get('p1')!.hand = hand_cards
      return ready_all(state)
    }

    it('rejects lower card on higher pile card', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '8')],
        [make_card('diamonds', '5'), make_card('clubs', 'K'), make_card('spades', 'A')],
      )

      expect_invalid(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      }, 'Cannot play')
    })

    it('allows equal rank on pile', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '8')],
        [make_card('diamonds', '8'), make_card('clubs', 'K'), make_card('spades', 'A')],
      )

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      expect(next.discard_pile).toHaveLength(2)
    })

    it('allows higher rank on pile', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '5')],
        [make_card('diamonds', '8'), make_card('clubs', 'K'), make_card('spades', 'A')],
      )

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      expect(next.discard_pile).toHaveLength(2)
    })
  })

  describe('play phase — special cards', () => {
    function setup_with_pile_and_hand(
      pile_cards: Card[],
      hand_cards: Card[],
    ): Shithead_state {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      state.discard_pile = pile_cards
      state.players.get('p1')!.hand = hand_cards
      return ready_all(state)
    }

    it('2 can be played on anything (reset)', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', 'A')],
        [make_card('diamonds', '2'), make_card('clubs', 'K'), make_card('spades', 'A')],
      )

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      expect(next.discard_pile).toHaveLength(2)
    })

    it('7 forces next player to play 7 or lower', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '5')],
        [make_card('diamonds', '7'), make_card('clubs', 'K'), make_card('spades', 'A')],
      )

      // p1 plays 7
      const after_7 = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      // p2 cannot play 8 or higher
      const p2 = after_7.players.get('p2')!
      p2.hand = [make_card('hearts', '8'), make_card('clubs', '3'), make_card('spades', 'Q')]

      expect_invalid(after_7, {
        player_id: 'p2',
        type: 'PLAY_CARD',
        card_ids: [p2.hand[0].id],
      }, 'Cannot play')

      // p2 can play 3 (≤7)
      const result = shithead_definition.validate_command(after_7, {
        player_id: 'p2',
        type: 'PLAY_CARD',
        card_ids: [p2.hand[1].id],
      })
      expect(result.valid).toBe(true)
    })

    it('7 allows playing another 7', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '5')],
        [make_card('diamonds', '7'), make_card('clubs', 'K'), make_card('spades', 'A')],
      )

      const after_7 = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      const p2 = after_7.players.get('p2')!
      p2.hand = [make_card('hearts', '7'), make_card('clubs', 'K'), make_card('spades', 'A')]

      const result = shithead_definition.validate_command(after_7, {
        player_id: 'p2',
        type: 'PLAY_CARD',
        card_ids: [p2.hand[0].id],
      })
      expect(result.valid).toBe(true)
    })

    it('10 burns the pile', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '5'), make_card('diamonds', '8')],
        [make_card('clubs', '10'), make_card('spades', 'K'), make_card('hearts', 'A')],
      )

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      expect(next.discard_pile).toHaveLength(0)
      expect(next.last_effect).toBe('burn')
    })

    it('10 gives same player another turn', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '5')],
        [make_card('clubs', '10'), make_card('spades', 'K'), make_card('hearts', 'A')],
      )

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      // p1 should still be current player after burn
      expect(next.player_order[next.current_player_index]).toBe('p1')
    })

    it('four of a kind burns the pile', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '5'), make_card('diamonds', '5'), make_card('clubs', '5')],
        [make_card('spades', '5'), make_card('hearts', 'K'), make_card('diamonds', 'A')],
      )

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      expect(next.discard_pile).toHaveLength(0)
      expect(next.last_effect).toBe('burn')
      // Same player gets another turn
      expect(next.player_order[next.current_player_index]).toBe('p1')
    })
  })

  describe('play phase — pick up pile', () => {
    it('picks up the entire pile into hand', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      state.discard_pile = [make_card('hearts', 'A'), make_card('diamonds', 'K')]
      const play_state = ready_all(state)

      const hand_before = play_state.players.get('p1')!.hand.length

      const next = apply(play_state, { player_id: 'p1', type: 'PICK_UP_PILE' })

      expect(next.players.get('p1')!.hand).toHaveLength(hand_before + 2)
      expect(next.discard_pile).toHaveLength(0)
    })

    it('rejects picking up empty pile', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const play_state = ready_all(state)

      expect_invalid(play_state, { player_id: 'p1', type: 'PICK_UP_PILE' }, 'Pile is empty')
    })

    it('advances turn after picking up', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      state.discard_pile = [make_card('hearts', 'A')]
      const play_state = ready_all(state)

      const next = apply(play_state, { player_id: 'p1', type: 'PICK_UP_PILE' })
      expect(next.player_order[next.current_player_index]).toBe('p2')
    })
  })

  describe('play phase — face-up and face-down cards', () => {
    it('plays from face-up when hand is empty', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = [] // Empty hand
      ps.face_up = [make_card('hearts', 'A'), make_card('diamonds', 'K'), make_card('clubs', 'Q')]
      state.deck = [] // No deck to draw from
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [ps.face_up[0].id],
      })

      expect(next.players.get('p1')!.face_up).toHaveLength(2)
      expect(next.discard_pile).toContainEqual(make_card('hearts', 'A'))
    })

    it('plays from face-down when hand and face-up are empty', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = []
      ps.face_up = []
      ps.face_down = [make_card('hearts', 'A'), make_card('diamonds', '3'), make_card('clubs', '5')]
      state.deck = []
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_FACE_DOWN',
        index: 0,
      })

      expect(next.players.get('p1')!.face_down).toHaveLength(2)
      expect(next.discard_pile).toContainEqual(make_card('hearts', 'A'))
      expect(next.last_revealed_card).toEqual(make_card('hearts', 'A'))
    })

    it('blind face-down play that fails picks up the pile', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = []
      ps.face_up = []
      ps.face_down = [make_card('hearts', '4')] // Low card
      state.discard_pile = [make_card('diamonds', 'K')] // High pile
      state.deck = []
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_FACE_DOWN',
        index: 0,
      })

      // p1 should pick up the pile + the played card
      expect(next.players.get('p1')!.hand).toHaveLength(2)
      expect(next.discard_pile).toHaveLength(0)
      expect(next.players.get('p1')!.face_down).toHaveLength(0)
      expect(next.last_revealed_card).toEqual(make_card('hearts', '4'))
    })

    it('rejects PLAY_FACE_DOWN with invalid index', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = []
      ps.face_up = []
      ps.face_down = [make_card('hearts', '3'), make_card('diamonds', '5')]
      state.deck = []
      const play_state = ready_all(state)

      expect_invalid(play_state, {
        player_id: 'p1',
        type: 'PLAY_FACE_DOWN',
        index: 5,
      }, 'Invalid face-down card index')

      expect_invalid(play_state, {
        player_id: 'p1',
        type: 'PLAY_FACE_DOWN',
        index: -1,
      }, 'Invalid face-down card index')
    })

    it('rejects PLAY_FACE_DOWN when hand is not empty', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = [make_card('hearts', 'A')]
      ps.face_up = []
      ps.face_down = [make_card('hearts', '3')]
      state.deck = []
      const play_state = ready_all(state)

      expect_invalid(play_state, {
        player_id: 'p1',
        type: 'PLAY_FACE_DOWN',
        index: 0,
      }, 'hand and face-up are empty')
    })

    it('last_revealed_card is cleared by next command', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = []
      ps.face_up = []
      ps.face_down = [make_card('hearts', 'A'), make_card('diamonds', '3')]
      state.discard_pile = []
      state.deck = []
      // Give p2 a card that can play on an Ace (a 2 resets)
      const p2 = state.players.get('p2')!
      p2.hand = [make_card('clubs', '2'), make_card('spades', 'K'), make_card('diamonds', 'A')]
      const play_state = ready_all(state)

      const after_reveal = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_FACE_DOWN',
        index: 0,
      })
      expect(after_reveal.last_revealed_card).toEqual(make_card('hearts', 'A'))

      // p2 plays a 2 (always playable) — last_revealed_card should be cleared
      const after_p2 = apply(after_reveal, {
        player_id: 'p2',
        type: 'PLAY_CARD',
        card_ids: [after_reveal.players.get('p2')!.hand[0].id],
      })
      expect(after_p2.last_revealed_card).toBeNull()
    })
  })

  describe('play phase — source enforcement', () => {
    it('rejects playing face-up card when hand is not empty', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = [make_card('hearts', 'A')]
      ps.face_up = [make_card('diamonds', 'K'), make_card('clubs', 'Q'), make_card('spades', 'J')]
      state.deck = []
      const play_state = ready_all(state)

      expect_invalid(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [ps.face_up[0].id],
      }, 'not found')
    })

    it('allows playing face-up card when hand is empty', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = []
      ps.face_up = [make_card('diamonds', 'K'), make_card('clubs', 'Q'), make_card('spades', 'J')]
      state.deck = []
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [ps.face_up[0].id],
      })

      expect(next.players.get('p1')!.face_up).toHaveLength(2)
      expect(next.discard_pile).toContainEqual(make_card('diamonds', 'K'))
    })

    it('rejects PLAY_FACE_DOWN when face-up cards remain', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = []
      ps.face_up = [make_card('diamonds', 'K')]
      ps.face_down = [make_card('hearts', '3')]
      state.deck = []
      const play_state = ready_all(state)

      expect_invalid(play_state, {
        player_id: 'p1',
        type: 'PLAY_FACE_DOWN',
        index: 0,
      }, 'hand and face-up are empty')
    })

    it('rejects playing hand card from face-up source', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      const hand_card = make_card('hearts', 'A')
      ps.hand = []
      ps.face_up = [make_card('diamonds', 'K'), make_card('clubs', 'Q'), hand_card]
      state.deck = []
      const play_state = ready_all(state)

      // Remove the card from face_up and put it in hand to simulate mismatch
      const ps2 = play_state.players.get('p1')!
      ps2.hand = [hand_card]
      ps2.face_up = [make_card('diamonds', 'K'), make_card('clubs', 'Q')]

      // Should reject face_up cards since hand is not empty
      expect_invalid(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [make_card('diamonds', 'K').id],
      }, 'not found')
    })

    it('apply_command removes card from hand only when source is hand', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      const card = make_card('hearts', 'A')
      ps.hand = [card, make_card('clubs', 'K'), make_card('spades', 'Q')]
      ps.face_up = [make_card('diamonds', '5'), make_card('diamonds', '6'), make_card('diamonds', '7')]
      state.deck = []
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [card.id],
      })

      expect(next.players.get('p1')!.hand).toHaveLength(2)
      expect(next.players.get('p1')!.face_up).toHaveLength(3) // untouched
    })

    it('apply_command removes card from face-up only when source is face_up', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      const card = make_card('diamonds', 'K')
      ps.hand = []
      ps.face_up = [card, make_card('clubs', 'Q'), make_card('spades', 'J')]
      state.deck = []
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [card.id],
      })

      expect(next.players.get('p1')!.face_up).toHaveLength(2)
      expect(next.players.get('p1')!.hand).toHaveLength(0) // still empty
    })
  })

  describe('game over', () => {
    it('detects when a player goes out', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = [make_card('hearts', 'A')]
      ps.face_up = []
      ps.face_down = []
      state.deck = []
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [ps.hand[0].id],
      })

      // With 2 players, when one goes out the game is over
      expect(next.phase).toBe('finished')
      expect(shithead_definition.is_game_over(next)).toBe(true)
    })

    it('continues with remaining players when one goes out in 3-player', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, THREE_PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = [make_card('hearts', 'A')]
      ps.face_up = []
      ps.face_down = []
      state.deck = []
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [ps.hand[0].id],
      })

      expect(next.phase).toBe('play') // Game continues
      expect(next.player_order).not.toContain('p1')
      expect(next.player_order).toHaveLength(2)
    })

    it('scores correctly — winners get 1, loser gets 0', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      const ps = state.players.get('p1')!
      ps.hand = [make_card('hearts', 'A')]
      ps.face_up = []
      ps.face_down = []
      state.deck = []
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [ps.hand[0].id],
      })

      const scores = shithead_definition.get_scores(next)
      expect(scores.get('p1')).toBe(1) // winner
      expect(scores.get('p2')).toBe(0) // shithead
    })
  })

  describe('get_visible_state', () => {
    it('shows own hand but not opponents hand', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)

      const visible = shithead_definition.get_visible_state(state, 'p1') as Visible_shithead_state

      // Can see own hand
      expect(visible.own_state.hand).toHaveLength(3)
      expect(visible.own_state.hand[0]).toHaveProperty('suit')
      expect(visible.own_state.hand[0]).toHaveProperty('rank')

      // Can only see opponent hand count
      expect(visible.players['p2'].hand_count).toBe(3)
      expect(visible.players['p2']).not.toHaveProperty('hand')
    })

    it('shows face-up cards for all players', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)

      const visible = shithead_definition.get_visible_state(state, 'p1') as Visible_shithead_state

      expect(visible.own_state.face_up).toHaveLength(3)
      expect(visible.players['p2'].face_up).toHaveLength(3)
      // Face-up cards should have full card info
      expect(visible.players['p2'].face_up[0]).toHaveProperty('suit')
    })

    it('hides face-down cards for all players', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)

      const visible = shithead_definition.get_visible_state(state, 'p1') as Visible_shithead_state

      expect(visible.own_state.face_down_count).toBe(3)
      expect(visible.own_state).not.toHaveProperty('face_down')
      expect(visible.players['p2'].face_down_count).toBe(3)
    })

    it('shows deck count but not deck contents', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)

      const visible = shithead_definition.get_visible_state(state, 'p1') as Visible_shithead_state

      expect(visible.deck_count).toBe(34)
      expect(visible).not.toHaveProperty('deck')
    })

    it('shows discard pile', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      state.discard_pile = [make_card('hearts', '5')]

      const visible = shithead_definition.get_visible_state(state, 'p1') as Visible_shithead_state

      expect(visible.discard_pile).toHaveLength(1)
      expect(visible.discard_pile[0]).toEqual(make_card('hearts', '5'))
    })
  })

  describe('play phase — new special cards (3, 8, 9, Q)', () => {
    function setup_with_pile_and_hand(
      pile_cards: Card[],
      hand_cards: Card[],
      players = PLAYERS,
    ): Shithead_state {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, players)
      state.discard_pile = pile_cards
      state.players.get('p1')!.hand = hand_cards
      return ready_all(state)
    }

    it('3 (invisible) can be played on anything', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', 'A')],
        [make_card('diamonds', '3'), make_card('clubs', 'K'), make_card('spades', 'A')],
      )

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      expect(next.discard_pile).toHaveLength(2)
    })

    it('3 is invisible — effective top is card below', () => {
      // Pile has a 5, then p1 plays a 3 on it
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '5')],
        [make_card('diamonds', '3'), make_card('clubs', 'K'), make_card('spades', 'A')],
      )

      const after_3 = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      // Effective top is the 5 beneath the 3, so p2 needs >= 5
      const p2 = after_3.players.get('p2')!
      p2.hand = [make_card('hearts', '4'), make_card('clubs', '6'), make_card('spades', 'A')]

      // 4 should fail (< 5)
      expect_invalid(after_3, {
        player_id: 'p2',
        type: 'PLAY_CARD',
        card_ids: [p2.hand[0].id],
      }, 'Cannot play')

      // 6 should succeed (>= 5)
      const result = shithead_definition.validate_command(after_3, {
        player_id: 'p2',
        type: 'PLAY_CARD',
        card_ids: [p2.hand[1].id],
      })
      expect(result.valid).toBe(true)
    })

    it('3 preserves 7s ≤7 restriction', () => {
      // Pile: 7, then 3 on top — effective top is 7
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '7'), make_card('diamonds', '3')],
        [make_card('clubs', '8'), make_card('spades', '5'), make_card('hearts', 'A')],
      )

      // 8 should fail (> 7)
      expect_invalid(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      }, 'Cannot play')

      // 5 should succeed (≤ 7)
      const result = shithead_definition.validate_command(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[1].id],
      })
      expect(result.valid).toBe(true)
    })

    it('3 preserves 9s odd restriction', () => {
      // Pile: 9, then 3 on top — effective top is 9
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '9'), make_card('diamonds', '3')],
        [make_card('clubs', '8'), make_card('spades', '5'), make_card('hearts', 'A')],
      )

      // 8 should fail (even)
      expect_invalid(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      }, 'Cannot play')

      // 5 should succeed (odd)
      const result = shithead_definition.validate_command(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[1].id],
      })
      expect(result.valid).toBe(true)
    })

    it('8 skips next player (3-player)', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, THREE_PLAYERS)
      state.discard_pile = [make_card('hearts', '5')]
      state.players.get('p1')!.hand = [make_card('diamonds', '8'), make_card('clubs', 'K'), make_card('spades', 'A')]
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [play_state.players.get('p1')!.hand[0].id],
      })

      // p1 plays 8, skips p2, should be p3's turn
      expect(next.player_order[next.current_player_index]).toBe('p3')
      expect(next.last_effect).toBe('skip')
    })

    it('two 8s skip two players (3-player, wraps around)', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, THREE_PLAYERS)
      state.discard_pile = [make_card('hearts', '5')]
      const eight_h = make_card('hearts', '8')
      const eight_d = make_card('diamonds', '8')
      state.players.get('p1')!.hand = [eight_h, eight_d, make_card('spades', 'A')]
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [eight_h.id, eight_d.id],
      })

      // p1 plays two 8s → skip p2 and p3 → back to p1
      expect(next.player_order[next.current_player_index]).toBe('p1')
    })

    it('8 skip in 2-player game gives current player another turn', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      state.discard_pile = [make_card('hearts', '5')]
      state.players.get('p1')!.hand = [make_card('diamonds', '8'), make_card('clubs', 'K'), make_card('spades', 'A')]
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [play_state.players.get('p1')!.hand[0].id],
      })

      // p1 plays 8 in 2-player → skip p2 → p1 goes again
      expect(next.player_order[next.current_player_index]).toBe('p1')
    })

    it('three 8s in 3-player game skips correctly', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, THREE_PLAYERS)
      state.discard_pile = [make_card('hearts', '5')]
      const eight_h = make_card('hearts', '8')
      const eight_d = make_card('diamonds', '8')
      const eight_c = make_card('clubs', '8')
      state.players.get('p1')!.hand = [eight_h, eight_d, eight_c]
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [eight_h.id, eight_d.id, eight_c.id],
      })

      // p1 plays three 8s in 3-player → skip p2, p3, p2 again → p3's turn
      expect(next.player_order[next.current_player_index]).toBe('p3')
    })

    it('9 forces odd rank — even card rejected, odd accepted', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '5')],
        [make_card('diamonds', '9'), make_card('clubs', 'K'), make_card('spades', 'A')],
      )

      // p1 plays 9
      const after_9 = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      const p2 = after_9.players.get('p2')!
      p2.hand = [make_card('hearts', '8'), make_card('clubs', '5'), make_card('spades', 'A')]

      // 8 should fail (even)
      expect_invalid(after_9, {
        player_id: 'p2',
        type: 'PLAY_CARD',
        card_ids: [p2.hand[0].id],
      }, 'Cannot play')

      // 5 should succeed (odd)
      const result = shithead_definition.validate_command(after_9, {
        player_id: 'p2',
        type: 'PLAY_CARD',
        card_ids: [p2.hand[1].id],
      })
      expect(result.valid).toBe(true)
    })

    it('2 and 10 are not playable on a 9 (both even)', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '9')],
        [make_card('diamonds', '2'), make_card('clubs', '10'), make_card('spades', '5')],
      )

      // 2 should fail (even)
      expect_invalid(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      }, 'Cannot play')

      // 10 should fail (even)
      expect_invalid(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[1].id],
      }, 'Cannot play')
    })

    it('Q reverses direction (3-player)', () => {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, THREE_PLAYERS)
      state.discard_pile = [make_card('hearts', '5')]
      state.players.get('p1')!.hand = [make_card('diamonds', 'Q'), make_card('clubs', 'K'), make_card('spades', 'A')]
      const play_state = ready_all(state)

      const next = apply(play_state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [play_state.players.get('p1')!.hand[0].id],
      })

      // Direction reversed, next turn goes to p3 (index wraps from 0 → -1 → 2)
      expect(next.direction).toBe(Direction.COUNTER_CLOCKWISE)
      expect(next.player_order[next.current_player_index]).toBe('p3')
      expect(next.last_effect).toBe('reverse')
    })

    it('Q in 2-player advances to other player', () => {
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '5')],
        [make_card('diamonds', 'Q'), make_card('clubs', 'K'), make_card('spades', 'A')],
      )

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [state.players.get('p1')!.hand[0].id],
      })

      // Q reverses direction and advances — other player's turn
      expect(next.player_order[next.current_player_index]).toBe('p2')
      expect(next.direction).toBe(Direction.COUNTER_CLOCKWISE)
      expect(next.last_effect).toBe('reverse')
    })

    it('two Qs cancel out (direction unchanged)', () => {
      const q_h = make_card('hearts', 'Q')
      const q_d = make_card('diamonds', 'Q')
      const state = setup_with_pile_and_hand(
        [make_card('hearts', '5')],
        [q_h, q_d, make_card('spades', 'A')],
      )

      const next = apply(state, {
        player_id: 'p1',
        type: 'PLAY_CARD',
        card_ids: [q_h.id, q_d.id],
      })

      // Double Q cancels — direction stays 1, advances normally to p2
      expect(next.direction).toBe(Direction.CLOCKWISE)
      expect(next.player_order[next.current_player_index]).toBe('p2')
      expect(next.last_effect).toBe(null)
    })
  })

  describe('playable ranks per pile top', () => {
    const ALL_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

    function playable_ranks_on(pile_top_rank: Rank): Rank[] {
      const pile = [make_card('hearts', pile_top_rank)]
      return ALL_RANKS.filter(rank => {
        const card = make_card('spades', rank)
        const result = shithead_definition.validate_command(
          setup_for_rank_test(pile, [card]),
          { player_id: 'p1', type: 'PLAY_CARD', card_ids: [card.id] },
        )
        return result.valid
      })
    }

    function playable_ranks_on_empty(): Rank[] {
      return ALL_RANKS.filter(rank => {
        const card = make_card('spades', rank)
        const result = shithead_definition.validate_command(
          setup_for_rank_test([], [card]),
          { player_id: 'p1', type: 'PLAY_CARD', card_ids: [card.id] },
        )
        return result.valid
      })
    }

    function setup_for_rank_test(pile: Card[], hand: Card[]): Shithead_state {
      const deck = create_ordered_deck()
      const state = deal_deterministic(deck, PLAYERS)
      state.discard_pile = pile
      // Ensure hand has 3 cards for validity (pad with filler if needed)
      const filler = [make_card('clubs', 'K'), make_card('diamonds', 'K')]
      state.players.get('p1')!.hand = [...hand, ...filler.slice(0, Math.max(0, 3 - hand.length))]
      state.deck = []
      return ready_all(state)
    }

    it('empty pile accepts all ranks', () => {
      expect(playable_ranks_on_empty()).toEqual(ALL_RANKS)
    })

    it('7 accepts ranks ≤ 7 and 10 (burn)', () => {
      expect(playable_ranks_on('7')).toEqual(['2', '3', '4', '5', '6', '7', '10'])
    })

    it('9 accepts only odd ranks (3, 5, 7, 9)', () => {
      expect(playable_ranks_on('9')).toEqual(['3', '5', '7', '9'])
    })

    it('5 accepts 5 and above plus 2, 3, 10', () => {
      expect(playable_ranks_on('5')).toEqual(['2', '3', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'])
    })

    it('A accepts only A plus 2, 3, 10', () => {
      expect(playable_ranks_on('A')).toEqual(['2', '3', '10', 'A'])
    })

    it('K accepts K and A plus 2, 3, 10', () => {
      expect(playable_ranks_on('K')).toEqual(['2', '3', '10', 'K', 'A'])
    })

    it('2 accepts all ranks (pile reset)', () => {
      expect(playable_ranks_on('2')).toEqual(ALL_RANKS)
    })
  })

  describe('full game simulation', () => {
    function current_player(state: Shithead_state): string {
      return state.player_order[state.current_player_index]
    }

    /** AI turn: try to play any valid card from hand/face-up/face-down, otherwise pick up */
    function take_turn(state: Shithead_state): Shithead_state {
      const pid = current_player(state)
      const ps = state.players.get(pid)!

      // Face-down: use PLAY_FACE_DOWN with index 0
      if (ps.hand.length === 0 && ps.face_up.length === 0 && ps.face_down.length > 0) {
        return shithead_definition.apply_command(state, {
          player_id: pid,
          type: 'PLAY_FACE_DOWN',
          index: 0,
        })
      }

      const source = ps.hand.length > 0 ? ps.hand : ps.face_up

      // Try each card in the source
      for (const card of source) {
        const result = shithead_definition.validate_command(state, {
          player_id: pid,
          type: 'PLAY_CARD',
          card_ids: [card.id],
        })
        if (result.valid) {
          return shithead_definition.apply_command(state, {
            player_id: pid,
            type: 'PLAY_CARD',
            card_ids: [card.id],
          })
        }
      }

      // No playable card — pick up pile if non-empty
      if (state.discard_pile.length > 0) {
        return shithead_definition.apply_command(state, { player_id: pid, type: 'PICK_UP_PILE' })
      }

      // Empty pile + no valid card shouldn't happen (any card plays on empty pile)
      // but play first card as fallback
      return shithead_definition.apply_command(state, {
        player_id: pid,
        type: 'PLAY_CARD',
        card_ids: [source[0].id],
      })
    }

    it('plays a complete 2-player game to completion', () => {
      // No deck remaining → forces players through hand → face-up → face-down quickly
      const deck: Card[] = [
        // p1: face_down
        make_card('hearts', '10'), make_card('hearts', 'Q'), make_card('hearts', 'K'),
        // p1: face_up
        make_card('hearts', 'A'), make_card('diamonds', 'A'), make_card('clubs', 'A'),
        // p1: hand
        make_card('spades', 'A'), make_card('spades', 'K'), make_card('spades', 'Q'),
        // p2: face_down
        make_card('diamonds', '3'), make_card('diamonds', '4'), make_card('diamonds', '5'),
        // p2: face_up
        make_card('diamonds', '6'), make_card('diamonds', '7'), make_card('diamonds', '8'),
        // p2: hand
        make_card('diamonds', '9'), make_card('diamonds', '10'), make_card('diamonds', 'J'),
      ]

      let state = deal_deterministic(deck, PLAYERS)
      expect(state.deck).toHaveLength(0)

      state = ready_all(state)
      expect(state.phase).toBe('play')

      // Run the game automatically
      let turns = 0
      while (!shithead_definition.is_game_over(state) && turns < 200) {
        state = take_turn(state)
        turns++
      }

      expect(shithead_definition.is_game_over(state)).toBe(true)
      expect(state.phase).toBe('finished')
      expect(turns).toBeLessThan(200)

      const scores = shithead_definition.get_scores(state)
      expect(scores.size).toBe(2)
      const score_values = Array.from(scores.values())
      expect(score_values).toContain(0) // loser (shithead)
      expect(score_values).toContain(1) // winner
    })

    it('plays a 3-player game to completion', () => {
      const deck = create_ordered_deck()
      let state = deal_deterministic(deck, THREE_PLAYERS)

      state = ready_all(state)
      expect(state.phase).toBe('play')

      let turns = 0
      while (!shithead_definition.is_game_over(state) && turns < 500) {
        state = take_turn(state)
        turns++
      }

      expect(shithead_definition.is_game_over(state)).toBe(true)
      expect(state.phase).toBe('finished')

      const scores = shithead_definition.get_scores(state)
      expect(scores.size).toBe(3)
      // Should have at least one winner and exactly one loser (shithead)
      const winners = Array.from(scores.values()).filter((s) => s === 1)
      const losers = Array.from(scores.values()).filter((s) => s === 0)
      expect(winners.length).toBeGreaterThanOrEqual(1)
      expect(losers).toHaveLength(1)
    })
  })
})
