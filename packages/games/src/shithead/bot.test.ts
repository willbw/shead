import { describe, it, expect } from 'vitest'
import type { Card, Player, Rank } from '@shead/shared'
import { Direction, SUITS, RANKS } from '@shead/shared'
import { shithead_definition } from './definition'
import type { Shithead_state, Shithead_command } from './types'
import { DEFAULT_SHITHEAD_CONFIG } from './types'
import {
  compute_swap_commands,
  compute_play_command,
  compute_bot_commands,
  is_bot_player,
  SWAP_PRIORITY,
} from './bot'

function make_card(suit: string, rank: string): Card {
  return { suit: suit as Card['suit'], rank: rank as Card['rank'], id: `${suit}-${rank}` }
}

function create_ordered_deck(): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank, id: `${suit}-${rank}` })
    }
  }
  return cards
}

const PLAYERS: Player[] = [
  { id: 'bot-1', name: 'Bot', connected: true },
  { id: 'p1', name: 'Human', connected: true },
]

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
    last_action: null,
  }
}

function make_play_state(overrides: Partial<Shithead_state> & { players: Map<string, { hand: Card[]; face_up: Card[]; face_down: Card[] }> }): Shithead_state {
  return {
    deck: [],
    discard_pile: [],
    player_order: [...overrides.players.keys()],
    current_player_index: 0,
    direction: Direction.CLOCKWISE,
    phase: 'play',
    ready_players: new Set(),
    last_effect: null,
    last_revealed_card: null,
    last_action: null,
    ...overrides,
  }
}

function ready_all(state: Shithead_state): Shithead_state {
  let s = state
  for (const id of s.player_order) {
    s = shithead_definition.apply_command(s, { player_id: id, type: 'READY' })
  }
  return s
}

describe('is_bot_player', () => {
  it('returns true for bot- prefix', () => {
    expect(is_bot_player('bot-1')).toBe(true)
    expect(is_bot_player('bot-abc')).toBe(true)
  })

  it('returns false for non-bot ids', () => {
    expect(is_bot_player('p1')).toBe(false)
    expect(is_bot_player('notbot-1')).toBe(false)
  })
})

describe('compute_swap_commands', () => {
  it('swaps hand cards with better priority to face-up', () => {
    // Hand has a 10 (priority 1), face-up has a 4 (priority 12)
    const hand = [make_card('hearts', '10'), make_card('clubs', '5'), make_card('diamonds', '6')]
    const face_up = [make_card('spades', '4'), make_card('hearts', 'A'), make_card('clubs', '2')]

    const cmds = compute_swap_commands('bot-1', hand, face_up)

    // Should swap 10 into face-up (replacing 4, the worst face-up card)
    const swaps = cmds.filter((c) => c.type === 'SWAP_CARD')
    expect(swaps.length).toBeGreaterThan(0)

    // Last command is always READY
    expect(cmds[cmds.length - 1].type).toBe('READY')
  })

  it('does not swap when face-up is already optimal', () => {
    // Face-up already has the best cards
    const hand = [make_card('hearts', '4'), make_card('clubs', '5'), make_card('diamonds', '6')]
    const face_up = [make_card('spades', '10'), make_card('hearts', '2'), make_card('clubs', 'A')]

    const cmds = compute_swap_commands('bot-1', hand, face_up)

    const swaps = cmds.filter((c) => c.type === 'SWAP_CARD')
    expect(swaps.length).toBe(0)
    expect(cmds.length).toBe(1) // just READY
    expect(cmds[0].type).toBe('READY')
  })

  it('always ends with READY', () => {
    const hand = [make_card('hearts', '3'), make_card('clubs', '4'), make_card('diamonds', '5')]
    const face_up = [make_card('spades', '6'), make_card('hearts', '7'), make_card('clubs', '8')]

    const cmds = compute_swap_commands('bot-1', hand, face_up)
    expect(cmds[cmds.length - 1].type).toBe('READY')
  })

  it('performs multiple swaps when beneficial', () => {
    // Hand: 10, 2, A (all great) — Face-up: 4, 5, 6 (all bad)
    const hand = [make_card('hearts', '10'), make_card('clubs', '2'), make_card('diamonds', 'A')]
    const face_up = [make_card('spades', '4'), make_card('hearts', '5'), make_card('clubs', '6')]

    const cmds = compute_swap_commands('bot-1', hand, face_up)
    const swaps = cmds.filter((c) => c.type === 'SWAP_CARD')
    expect(swaps.length).toBe(3)
  })
})

describe('compute_play_command', () => {
  it('plays the lowest playable card', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '5'), make_card('clubs', 'K'), make_card('diamonds', '8')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
      discard_pile: [make_card('spades', '4')],
    })

    const cmd = compute_play_command(state, 'bot-1')
    expect(cmd.type).toBe('PLAY_CARD')
    if (cmd.type === 'PLAY_CARD') {
      expect(cmd.card_ids).toEqual(['hearts-5'])
    }
  })

  it('plays all duplicates of the lowest rank', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '5'), make_card('clubs', '5'), make_card('diamonds', 'K')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
      discard_pile: [make_card('spades', '4')],
    })

    const cmd = compute_play_command(state, 'bot-1')
    expect(cmd.type).toBe('PLAY_CARD')
    if (cmd.type === 'PLAY_CARD') {
      expect(cmd.card_ids).toHaveLength(2)
      expect(cmd.card_ids).toContain('hearts-5')
      expect(cmd.card_ids).toContain('clubs-5')
    }
  })

  it('prefers four-of-a-kind completion', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '5'), make_card('clubs', '8'), make_card('diamonds', '3')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', 'A')], face_up: [], face_down: [] }],
      ]),
      // Pile has three 8s on top
      discard_pile: [make_card('spades', '8'), make_card('diamonds', '8'), make_card('hearts', '8')],
    })

    const cmd = compute_play_command(state, 'bot-1')
    expect(cmd.type).toBe('PLAY_CARD')
    if (cmd.type === 'PLAY_CARD') {
      expect(cmd.card_ids).toEqual(['clubs-8'])
    }
  })

  it('picks up pile when no card is playable', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '4'), make_card('clubs', '5')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
      discard_pile: [make_card('spades', 'K')],
    })

    const cmd = compute_play_command(state, 'bot-1')
    expect(cmd.type).toBe('PICK_UP_PILE')
  })

  it('plays face-down when only face-down remains', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [], face_up: [], face_down: [make_card('hearts', '7'), make_card('clubs', '9')] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
    })

    const cmd = compute_play_command(state, 'bot-1')
    expect(cmd.type).toBe('PLAY_FACE_DOWN')
    if (cmd.type === 'PLAY_FACE_DOWN') {
      expect(cmd.index).toBe(0)
    }
  })

  it('plays from face-up when hand is empty', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [], face_up: [make_card('hearts', '6'), make_card('clubs', 'K')], face_down: [make_card('diamonds', '3')] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
      discard_pile: [make_card('spades', '4')],
    })

    const cmd = compute_play_command(state, 'bot-1')
    expect(cmd.type).toBe('PLAY_CARD')
    if (cmd.type === 'PLAY_CARD') {
      expect(cmd.card_ids).toEqual(['hearts-6'])
    }
  })

  it('plays on empty pile (any card is valid)', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '4'), make_card('clubs', 'K')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
      discard_pile: [],
    })

    const cmd = compute_play_command(state, 'bot-1')
    expect(cmd.type).toBe('PLAY_CARD')
    if (cmd.type === 'PLAY_CARD') {
      // Should play the lowest (4)
      expect(cmd.card_ids).toEqual(['hearts-4'])
    }
  })

  it('respects 7 restriction', () => {
    // When a 7 is on pile, must play <= 7
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', 'K'), make_card('clubs', '5'), make_card('diamonds', '8')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
      discard_pile: [make_card('spades', '7')],
    })

    const cmd = compute_play_command(state, 'bot-1')
    expect(cmd.type).toBe('PLAY_CARD')
    if (cmd.type === 'PLAY_CARD') {
      // Only 5 is playable under 7 restriction
      expect(cmd.card_ids).toEqual(['clubs-5'])
    }
  })
})

describe('compute_bot_commands', () => {
  it('returns empty if already ready in swap phase', () => {
    const state = make_play_state({
      phase: 'swap' as const,
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '4')], face_up: [make_card('clubs', '5')], face_down: [make_card('diamonds', '6')] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [make_card('hearts', '7')], face_down: [make_card('clubs', '8')] }],
      ]),
      ready_players: new Set(['bot-1']),
    })

    const cmds = compute_bot_commands(state, 'bot-1')
    expect(cmds).toHaveLength(0)
  })

  it('returns empty if not bot turn in play phase', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '4')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
      current_player_index: 1, // p1's turn
    })

    const cmds = compute_bot_commands(state, 'bot-1')
    expect(cmds).toHaveLength(0)
  })

  it('returns swap + ready commands in swap phase', () => {
    const state = make_play_state({
      phase: 'swap' as const,
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '10')], face_up: [make_card('clubs', '4')], face_down: [make_card('diamonds', '6')] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [make_card('hearts', '7')], face_down: [make_card('clubs', '8')] }],
      ]),
    })

    const cmds = compute_bot_commands(state, 'bot-1')
    expect(cmds.length).toBeGreaterThan(0)
    expect(cmds[cmds.length - 1].type).toBe('READY')
  })

  it('returns empty in finished phase', () => {
    const state = make_play_state({
      phase: 'finished' as const,
      players: new Map([
        ['bot-1', { hand: [], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
    })

    const cmds = compute_bot_commands(state, 'bot-1')
    expect(cmds).toHaveLength(0)
  })
})

describe('bot integration — all moves validate', () => {
  it('bot-vs-bot game completes without validation errors', () => {
    const bot_players: Player[] = [
      { id: 'bot-1', name: 'Bot 1', connected: true },
      { id: 'bot-2', name: 'Bot 2', connected: true },
    ]

    let state = shithead_definition.initial_state(DEFAULT_SHITHEAD_CONFIG, bot_players)

    // Swap phase: both bots swap and ready
    for (const bot_id of ['bot-1', 'bot-2']) {
      const ps = state.players.get(bot_id)!
      const cmds = compute_swap_commands(bot_id, ps.hand, ps.face_up)
      for (const cmd of cmds) {
        const result = shithead_definition.validate_command(state, cmd)
        expect(result.valid, `Swap command failed for ${bot_id}: ${'reason' in result ? result.reason : ''}`).toBe(true)
        state = shithead_definition.apply_command(state, cmd)
      }
    }

    expect(state.phase).toBe('play')

    // Play phase: run until game is over (with safety limit)
    let turns = 0
    const max_turns = 500
    while (state.phase !== 'finished' && turns < max_turns) {
      const current_id = state.player_order[state.current_player_index]
      const cmd = compute_play_command(state, current_id)
      const result = shithead_definition.validate_command(state, cmd)
      expect(result.valid, `Play command failed on turn ${turns} for ${current_id}: ${'reason' in result ? result.reason : ''}`).toBe(true)
      state = shithead_definition.apply_command(state, cmd)
      turns++
    }

    expect(state.phase).toBe('finished')
    expect(turns).toBeLessThan(max_turns)
  })

  it('bot handles single card remaining', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', 'A')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3'), make_card('clubs', '4')], face_up: [], face_down: [] }],
      ]),
      discard_pile: [make_card('diamonds', '5')],
    })

    const cmd = compute_play_command(state, 'bot-1')
    expect(cmd.type).toBe('PLAY_CARD')
    const result = shithead_definition.validate_command(state, cmd)
    expect(result.valid).toBe(true)
  })
})
