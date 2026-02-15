import { describe, it, expect } from 'vitest'
import type { Card, Suit, Rank, Player } from '@shead/shared'
import { gin_rummy_definition } from './definition'
import type { Gin_rummy_state, Gin_rummy_command, Visible_gin_rummy_state } from './types'
import { calculate_deadwood_points, find_optimal_melds } from './melds'

function card(suit: Suit, rank: Rank): Card {
  return { suit, rank, id: `${suit}-${rank}` }
}

function make_players(): Player[] {
  return [
    { id: 'p1', name: 'Alice', connected: true },
    { id: 'p2', name: 'Bob', connected: true },
  ]
}

function create_state(overrides?: Partial<Gin_rummy_state>): Gin_rummy_state {
  const state = gin_rummy_definition.initial_state({}, make_players())
  if (overrides) Object.assign(state, overrides)
  return state
}

function cmd(player_id: string, data: Record<string, unknown>): Gin_rummy_command {
  return { player_id, ...data } as Gin_rummy_command
}

function get_visible(state: Gin_rummy_state, player_id: string): Visible_gin_rummy_state {
  return gin_rummy_definition.get_visible_state(state, player_id) as Visible_gin_rummy_state
}

function apply(state: Gin_rummy_state, c: Gin_rummy_command): Gin_rummy_state {
  const result = gin_rummy_definition.validate_command(state, c)
  expect(result).toEqual({ valid: true })
  return gin_rummy_definition.apply_command(state, c)
}

describe('initial_state', () => {
  it('creates correct initial state', () => {
    const state = create_state()
    expect(state.phase).toBe('first_draw')
    expect(state.player_order).toEqual(['p1', 'p2'])
    expect(state.players.get('p1')!.hand).toHaveLength(10)
    expect(state.players.get('p2')!.hand).toHaveLength(10)
    expect(state.discard_pile).toHaveLength(1)
    expect(state.stock.length).toBe(52 - 20 - 1)
    expect(state.scores.get('p1')).toBe(0)
    expect(state.scores.get('p2')).toBe(0)
    expect(state.round_number).toBe(1)
    expect(state.target_score).toBe(100)
  })

  it('non-dealer goes first', () => {
    const state = create_state()
    // p1 is dealer, p2 should be current
    expect(state.dealer).toBe('p1')
    expect(state.current_player).toBe('p2')
  })

  it('respects target_score config', () => {
    const state = gin_rummy_definition.initial_state({ target_score: 50 }, make_players())
    expect(state.target_score).toBe(50)
  })
})

describe('first_draw phase', () => {
  it('non-dealer can take discard', () => {
    const state = create_state()
    const discard_card = state.discard_pile[0]
    const next = apply(state, cmd('p2', { type: 'DRAW_DISCARD' }))
    expect(next.phase).toBe('discard')
    expect(next.players.get('p2')!.hand).toHaveLength(11)
    expect(next.players.get('p2')!.hand.some(c => c.id === discard_card.id)).toBe(true)
    expect(next.discard_pile).toHaveLength(0)
  })

  it('non-dealer can pass', () => {
    const state = create_state()
    const next = apply(state, cmd('p2', { type: 'PASS_FIRST_DRAW' }))
    expect(next.phase).toBe('first_draw')
    expect(next.first_draw_passes).toBe(1)
    expect(next.current_player).toBe('p1') // dealer's turn
  })

  it('dealer can take discard after non-dealer passes', () => {
    let state = create_state()
    state = apply(state, cmd('p2', { type: 'PASS_FIRST_DRAW' }))
    const discard_card = state.discard_pile[0]
    state = apply(state, cmd('p1', { type: 'DRAW_DISCARD' }))
    expect(state.phase).toBe('discard')
    expect(state.players.get('p1')!.hand).toHaveLength(11)
    expect(state.players.get('p1')!.hand.some(c => c.id === discard_card.id)).toBe(true)
  })

  it('both pass → non-dealer enters normal draw phase', () => {
    let state = create_state()
    state = apply(state, cmd('p2', { type: 'PASS_FIRST_DRAW' }))
    state = apply(state, cmd('p1', { type: 'PASS_FIRST_DRAW' }))
    expect(state.phase).toBe('draw')
    expect(state.current_player).toBe('p2')
  })

  it('rejects DRAW_STOCK during first_draw', () => {
    const state = create_state()
    const result = gin_rummy_definition.validate_command(state, cmd('p2', { type: 'DRAW_STOCK' }))
    expect(result.valid).toBe(false)
  })

  it('rejects wrong player', () => {
    const state = create_state()
    const result = gin_rummy_definition.validate_command(state, cmd('p1', { type: 'PASS_FIRST_DRAW' }))
    expect(result.valid).toBe(false)
  })
})

describe('draw and discard cycle', () => {
  function setup_draw_phase(): Gin_rummy_state {
    let state = create_state()
    // Both pass first draw → normal draw phase
    state = apply(state, cmd('p2', { type: 'PASS_FIRST_DRAW' }))
    state = apply(state, cmd('p1', { type: 'PASS_FIRST_DRAW' }))
    return state
  }

  it('draw from stock → discard phase', () => {
    const state = setup_draw_phase()
    const stock_count = state.stock.length
    const next = apply(state, cmd('p2', { type: 'DRAW_STOCK' }))
    expect(next.phase).toBe('discard')
    expect(next.players.get('p2')!.hand).toHaveLength(11)
    expect(next.stock.length).toBe(stock_count - 1)
  })

  it('draw from discard → discard phase', () => {
    const state = setup_draw_phase()
    const discard_top = state.discard_pile[state.discard_pile.length - 1]
    const next = apply(state, cmd('p2', { type: 'DRAW_DISCARD' }))
    expect(next.phase).toBe('discard')
    expect(next.players.get('p2')!.hand).toHaveLength(11)
    expect(next.last_drawn_from_discard_id).toBe(discard_top.id)
  })

  it('discard → swaps turn → draw phase', () => {
    let state = setup_draw_phase()
    state = apply(state, cmd('p2', { type: 'DRAW_STOCK' }))
    const card_to_discard = state.players.get('p2')!.hand[0]
    state = apply(state, cmd('p2', { type: 'DISCARD', card_id: card_to_discard.id }))
    expect(state.phase).toBe('draw')
    expect(state.current_player).toBe('p1')
    expect(state.players.get('p2')!.hand).toHaveLength(10)
    expect(state.discard_pile[state.discard_pile.length - 1].id).toBe(card_to_discard.id)
  })

  it('rejects discard of card not in hand', () => {
    let state = setup_draw_phase()
    state = apply(state, cmd('p2', { type: 'DRAW_STOCK' }))
    const result = gin_rummy_definition.validate_command(state, cmd('p2', { type: 'DISCARD', card_id: 'fake-card' }))
    expect(result.valid).toBe(false)
  })

  it('rejects discard of card just drawn from discard pile', () => {
    let state = setup_draw_phase()
    const discard_top = state.discard_pile[state.discard_pile.length - 1]
    state = apply(state, cmd('p2', { type: 'DRAW_DISCARD' }))
    const result = gin_rummy_definition.validate_command(state, cmd('p2', { type: 'DISCARD', card_id: discard_top.id }))
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toContain('just drew')
    }
  })

  it('allows discard of card drawn from stock', () => {
    let state = setup_draw_phase()
    state = apply(state, cmd('p2', { type: 'DRAW_STOCK' }))
    // The last card added to hand is the drawn card
    const drawn_card = state.players.get('p2')!.hand[state.players.get('p2')!.hand.length - 1]
    const result = gin_rummy_definition.validate_command(state, cmd('p2', { type: 'DISCARD', card_id: drawn_card.id }))
    expect(result.valid).toBe(true)
  })
})

describe('knock', () => {
  it('validates knock with deadwood <= 10', () => {
    let state = create_state()
    // Set up p2's hand with known cards for a valid knock
    state.players.get('p2')!.hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'),
      card('diamonds', '4'), card('diamonds', '5'), card('diamonds', '6'),
      card('clubs', '7'), card('clubs', '8'), card('clubs', '9'),
      card('spades', 'A'), card('spades', '2'),  // 11 cards, deadwood = A(1)+2(2) = 3
    ]
    state.phase = 'discard'
    state.current_player = 'p2'

    const melds = [
      ['hearts-A', 'hearts-2', 'hearts-3'],
      ['diamonds-4', 'diamonds-5', 'diamonds-6'],
      ['clubs-7', 'clubs-8', 'clubs-9'],
    ]

    const result = gin_rummy_definition.validate_command(state, cmd('p2', { type: 'KNOCK', melds }))
    expect(result.valid).toBe(true)
  })

  it('rejects knock with deadwood > 10', () => {
    let state = create_state()
    state.players.get('p2')!.hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'),
      card('diamonds', 'K'), card('diamonds', 'Q'), card('diamonds', 'J'),
      card('clubs', '7'), card('clubs', '8'), card('clubs', '9'),
      card('spades', 'K'), card('spades', 'Q'),  // deadwood = K(10)+Q(10) = 20
    ]
    state.phase = 'discard'
    state.current_player = 'p2'

    const melds = [
      ['hearts-A', 'hearts-2', 'hearts-3'],
      ['diamonds-K', 'diamonds-Q', 'diamonds-J'],
      ['clubs-7', 'clubs-8', 'clubs-9'],
    ]

    const result = gin_rummy_definition.validate_command(state, cmd('p2', { type: 'KNOCK', melds }))
    expect(result.valid).toBe(false)
  })

  it('knock transitions to knock_response', () => {
    let state = create_state()
    state.players.get('p2')!.hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'),
      card('diamonds', '4'), card('diamonds', '5'), card('diamonds', '6'),
      card('clubs', '7'), card('clubs', '8'), card('clubs', '9'),
      card('spades', 'A'), card('spades', '2'),
    ]
    state.phase = 'discard'
    state.current_player = 'p2'

    const next = apply(state, cmd('p2', {
      type: 'KNOCK',
      melds: [
        ['hearts-A', 'hearts-2', 'hearts-3'],
        ['diamonds-4', 'diamonds-5', 'diamonds-6'],
        ['clubs-7', 'clubs-8', 'clubs-9'],
      ],
    }))

    expect(next.phase).toBe('knock_response')
    expect(next.knocker_id).toBe('p2')
    expect(next.current_player).toBe('p1')
    expect(next.knocker_melds).toHaveLength(3)
    expect(next.knocker_deadwood).toHaveLength(2)
  })
})

describe('gin', () => {
  it('validates gin with zero deadwood', () => {
    let state = create_state()
    state.players.get('p2')!.hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'),
      card('diamonds', '4'), card('diamonds', '5'), card('diamonds', '6'),
      card('clubs', '7'), card('clubs', '8'), card('clubs', '9'), card('clubs', '10'),
      card('spades', 'K'),
    ]
    state.phase = 'discard'
    state.current_player = 'p2'

    // This doesn't have zero deadwood (K is leftover), so GIN should fail
    const result = gin_rummy_definition.validate_command(state, cmd('p2', {
      type: 'GIN',
      melds: [
        ['hearts-A', 'hearts-2', 'hearts-3'],
        ['diamonds-4', 'diamonds-5', 'diamonds-6'],
        ['clubs-7', 'clubs-8', 'clubs-9', 'clubs-10'],
      ],
    }))
    expect(result.valid).toBe(false)
  })

  it('accepts valid gin and scores immediately', () => {
    let state = create_state()
    // Need 11 cards all in melds for gin
    state.players.get('p2')!.hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'), card('hearts', '4'),
      card('diamonds', '5'), card('diamonds', '6'), card('diamonds', '7'),
      card('clubs', '8'), card('clubs', '9'), card('clubs', '10'), card('clubs', 'J'),
    ]
    // p1's hand has some deadwood
    state.players.get('p1')!.hand = [
      card('spades', 'K'), card('spades', 'Q'), card('spades', 'J'),
      card('hearts', '9'), card('hearts', '8'),
      card('diamonds', '3'), card('diamonds', '2'),
      card('clubs', 'A'), card('clubs', '2'), card('clubs', '3'),
    ]
    state.phase = 'discard'
    state.current_player = 'p2'

    const next = apply(state, cmd('p2', {
      type: 'GIN',
      melds: [
        ['hearts-A', 'hearts-2', 'hearts-3', 'hearts-4'],
        ['diamonds-5', 'diamonds-6', 'diamonds-7'],
        ['clubs-8', 'clubs-9', 'clubs-10', 'clubs-J'],
      ],
    }))

    expect(next.phase).toBe('round_over')
    expect(next.knocker_id).toBe('p2')
    expect(next.round_history).toHaveLength(1)
    expect(next.round_history[0].was_gin).toBe(true)
    expect(next.round_history[0].winner).toBe('p2')
    // Gin bonus: opponent deadwood + 25
    const p1_dw = find_optimal_melds(state.players.get('p1')!.hand)
    const p1_dw_points = calculate_deadwood_points(p1_dw.deadwood)
    expect(next.round_history[0].points_awarded).toBe(p1_dw_points + 25)
    expect(next.scores.get('p2')).toBe(p1_dw_points + 25)
  })
})

describe('knock response and scoring', () => {
  function setup_knock(): Gin_rummy_state {
    let state = create_state()
    state.players.get('p2')!.hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'),
      card('diamonds', '4'), card('diamonds', '5'), card('diamonds', '6'),
      card('clubs', '7'), card('clubs', '8'), card('clubs', '9'),
      card('spades', '3'), card('spades', '4'),  // deadwood = 3+4 = 7
    ]
    state.players.get('p1')!.hand = [
      card('spades', 'K'), card('spades', 'Q'), card('spades', 'J'),
      card('hearts', 'K'), card('hearts', 'Q'),
      card('diamonds', 'A'), card('diamonds', '2'),
      card('clubs', 'K'), card('clubs', 'Q'), card('clubs', 'J'),
    ]
    state.phase = 'discard'
    state.current_player = 'p2'

    return apply(state, cmd('p2', {
      type: 'KNOCK',
      melds: [
        ['hearts-A', 'hearts-2', 'hearts-3'],
        ['diamonds-4', 'diamonds-5', 'diamonds-6'],
        ['clubs-7', 'clubs-8', 'clubs-9'],
      ],
    }))
  }

  it('defender can accept knock', () => {
    const state = setup_knock()
    expect(state.phase).toBe('knock_response')
    const next = apply(state, cmd('p1', { type: 'ACCEPT_KNOCK' }))
    expect(next.phase).toBe('round_over')
    expect(next.round_history).toHaveLength(1)
  })

  it('defender can lay off cards', () => {
    const state = setup_knock()
    // p1 has diamonds-A and diamonds-2, knocker has diamonds-4,5,6 meld
    // Can't lay off on that run (need 3 or 7)
    // But knocker has hearts-A,2,3 run — p1 doesn't have hearts-4
    // Knocker has clubs-7,8,9 — p1 has clubs-K,Q,J — can't extend

    // Let's set up a state where lay off is possible
    let state2 = create_state()
    state2.players.get('p2')!.hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'),
      card('diamonds', '4'), card('diamonds', '5'), card('diamonds', '6'),
      card('clubs', '7'), card('clubs', '8'), card('clubs', '9'),
      card('spades', '3'), card('spades', '4'),
    ]
    state2.players.get('p1')!.hand = [
      card('hearts', '4'),  // can extend hearts A-2-3 run
      card('spades', 'K'), card('spades', 'Q'), card('spades', 'J'),
      card('diamonds', 'K'), card('diamonds', 'Q'),
      card('clubs', 'K'), card('clubs', 'Q'), card('clubs', 'J'),
      card('hearts', 'K'),
    ]
    state2.phase = 'discard'
    state2.current_player = 'p2'

    state2 = apply(state2, cmd('p2', {
      type: 'KNOCK',
      melds: [
        ['hearts-A', 'hearts-2', 'hearts-3'],
        ['diamonds-4', 'diamonds-5', 'diamonds-6'],
        ['clubs-7', 'clubs-8', 'clubs-9'],
      ],
    }))

    expect(state2.phase).toBe('knock_response')
    // Lay off hearts-4 on the hearts A-2-3 meld (index 0)
    state2 = apply(state2, cmd('p1', { type: 'LAY_OFF', card_ids: ['hearts-4'], meld_index: 0 }))
    expect(state2.players.get('p1')!.hand).toHaveLength(9)
    expect(state2.knocker_melds![0]).toHaveLength(4) // extended
    expect(state2.defender_layoffs).toHaveLength(1)
  })

  it('knocker cannot lay off', () => {
    const state = setup_knock()
    const result = gin_rummy_definition.validate_command(state, cmd('p2', {
      type: 'LAY_OFF', card_ids: ['spades-3'], meld_index: 0,
    }))
    expect(result.valid).toBe(false)
  })
})

describe('undercut', () => {
  it('awards undercut bonus to defender', () => {
    let state = create_state()
    // Knocker (p2) has deadwood = 8
    state.players.get('p2')!.hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'),
      card('diamonds', '4'), card('diamonds', '5'), card('diamonds', '6'),
      card('clubs', '7'), card('clubs', '8'), card('clubs', '9'),
      card('spades', '3'), card('spades', '5'),  // deadwood = 3+5 = 8
    ]
    // Defender (p1) has deadwood <= 8 (say 5)
    state.players.get('p1')!.hand = [
      card('spades', 'K'), card('spades', 'Q'), card('spades', 'J'),
      card('hearts', 'K'), card('hearts', 'Q'), card('hearts', 'J'),
      card('diamonds', 'K'), card('diamonds', 'Q'), card('diamonds', 'J'),
      card('clubs', 'A'),  // deadwood = 1
    ]
    state.phase = 'discard'
    state.current_player = 'p2'

    state = apply(state, cmd('p2', {
      type: 'KNOCK',
      melds: [
        ['hearts-A', 'hearts-2', 'hearts-3'],
        ['diamonds-4', 'diamonds-5', 'diamonds-6'],
        ['clubs-7', 'clubs-8', 'clubs-9'],
      ],
    }))

    state = apply(state, cmd('p1', { type: 'ACCEPT_KNOCK' }))
    expect(state.round_history[0].was_undercut).toBe(true)
    expect(state.round_history[0].winner).toBe('p1')
    // Undercut: knocker_dw - defender_dw + 25 = 8 - 1 + 25 = 32
    expect(state.round_history[0].points_awarded).toBe(8 - 1 + 25)
    expect(state.scores.get('p1')).toBe(32)
  })
})

describe('multi-round and game over', () => {
  it('NEXT_ROUND re-deals and swaps dealer', () => {
    let state = create_state()
    // Force round_over
    state.phase = 'round_over'
    state.round_history = [{
      round_number: 1, winner: 'p2', knocker: 'p2',
      was_gin: false, was_undercut: false, points_awarded: 10,
      knocker_deadwood: 5, defender_deadwood: 15,
    }]

    state = apply(state, cmd('p1', { type: 'NEXT_ROUND' }))
    expect(state.phase).toBe('first_draw')
    expect(state.round_number).toBe(2)
    // Dealer should have swapped
    expect(state.dealer).toBe('p2')
    // Non-dealer (p1) goes first
    expect(state.current_player).toBe('p1')
    expect(state.players.get('p1')!.hand).toHaveLength(10)
    expect(state.players.get('p2')!.hand).toHaveLength(10)
    expect(state.discard_pile).toHaveLength(1)
  })

  it('game ends when target score is reached', () => {
    let state = create_state()
    state.target_score = 30
    state.scores.set('p2', 25)

    // Set up gin for p2 to win
    state.players.get('p2')!.hand = [
      card('hearts', 'A'), card('hearts', '2'), card('hearts', '3'), card('hearts', '4'),
      card('diamonds', '5'), card('diamonds', '6'), card('diamonds', '7'),
      card('clubs', '8'), card('clubs', '9'), card('clubs', '10'), card('clubs', 'J'),
    ]
    state.players.get('p1')!.hand = [
      card('spades', 'K'), card('spades', 'Q'), card('spades', 'J'),
      card('hearts', 'K'), card('hearts', 'Q'),
      card('diamonds', 'K'), card('diamonds', 'Q'),
      card('clubs', 'K'), card('clubs', 'Q'),
      card('spades', '9'),
    ]
    state.phase = 'discard'
    state.current_player = 'p2'

    state = apply(state, cmd('p2', {
      type: 'GIN',
      melds: [
        ['hearts-A', 'hearts-2', 'hearts-3', 'hearts-4'],
        ['diamonds-5', 'diamonds-6', 'diamonds-7'],
        ['clubs-8', 'clubs-9', 'clubs-10', 'clubs-J'],
      ],
    }))

    expect(state.phase).toBe('finished')
    expect(gin_rummy_definition.is_game_over(state)).toBe(true)
  })
})

describe('stock exhaustion', () => {
  it('round is a draw when stock has 2 or fewer cards after draw', () => {
    let state = create_state()
    // Set stock to exactly 3 cards so drawing one leaves 2
    state.stock = [card('spades', '2'), card('spades', '3'), card('spades', '4')]
    state.phase = 'draw'
    state.current_player = 'p2'

    state = apply(state, cmd('p2', { type: 'DRAW_STOCK' }))
    expect(state.phase).toBe('round_over')
    expect(state.round_history).toHaveLength(1)
    expect(state.round_history[0].winner).toBeNull()
    expect(state.round_history[0].points_awarded).toBe(0)
  })

  it('stock exhaustion after discard also triggers draw', () => {
    let state = create_state()
    state.stock = [card('spades', '2'), card('spades', '3')]  // 2 cards left
    state.phase = 'discard'
    state.current_player = 'p2'
    state.last_drawn_from_discard_id = null

    const card_to_discard = state.players.get('p2')!.hand[0]
    state = apply(state, cmd('p2', { type: 'DISCARD', card_id: card_to_discard.id }))
    expect(state.phase).toBe('round_over')
    expect(state.round_history[0].winner).toBeNull()
  })
})

describe('get_visible_state', () => {
  it('hides opponent hand during play', () => {
    const state = create_state()
    const visible = get_visible(state, 'p1')
    expect(visible.own_hand).toHaveLength(10)
    expect(visible.opponent.hand_count).toBe(10)
    expect(visible.opponent_hand).toBeNull()
  })

  it('shows opponent hand during knock_response', () => {
    let state = create_state()
    state.phase = 'knock_response'
    state.knocker_id = 'p2'
    state.knocker_melds = [[card('hearts', 'A'), card('hearts', '2'), card('hearts', '3')]]
    state.knocker_deadwood = [card('spades', 'K')]

    const visible = get_visible(state, 'p1')
    expect(visible.opponent_hand).toHaveLength(10)
  })

  it('includes scores and round history', () => {
    const state = create_state()
    state.scores.set('p1', 42)
    const visible = get_visible(state, 'p1')
    expect(visible.scores['p1']).toBe(42)
    expect(visible.round_history).toEqual([])
    expect(visible.target_score).toBe(100)
  })
})

describe('edge cases', () => {
  it('rejects commands after game is over', () => {
    const state = create_state()
    state.phase = 'finished'
    const result = gin_rummy_definition.validate_command(state, cmd('p1', { type: 'DRAW_STOCK' }))
    expect(result.valid).toBe(false)
  })

  it('rejects unknown player', () => {
    const state = create_state()
    const result = gin_rummy_definition.validate_command(state, cmd('p3', { type: 'PASS_FIRST_DRAW' }))
    expect(result.valid).toBe(false)
  })

  it('get_scores returns cumulative scores', () => {
    const state = create_state()
    state.scores.set('p1', 50)
    state.scores.set('p2', 30)
    const scores = gin_rummy_definition.get_scores(state)
    expect(scores.get('p1')).toBe(50)
    expect(scores.get('p2')).toBe(30)
  })
})
