import { describe, it, expect } from 'vitest'
import type { Card, Player } from '@shead/shared'
import { Direction, SUITS, RANKS } from '@shead/shared'
import { shithead_definition } from './definition'
import type { Shithead_state, Shithead_command } from './types'
import { DEFAULT_SHITHEAD_CONFIG } from './types'
import { compute_swap_commands } from './bot'
import { ismcts_compute_command, MEDIUM_CONFIG } from './bot_ismcts'

function make_card(suit: string, rank: string): Card {
  return { suit: suit as Card['suit'], rank: rank as Card['rank'], id: `${suit}-${rank}` }
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

// Use a small config for tests to keep them fast
const TEST_CONFIG = {
  num_determinizations: 10,
  num_rollouts_per_determinization: 3,
}

describe('ismcts_compute_command', () => {
  it('returns a valid command', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '5'), make_card('clubs', 'K'), make_card('diamonds', '8')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
      discard_pile: [make_card('spades', '4')],
    })

    const cmd = ismcts_compute_command(state, 'bot-1', TEST_CONFIG)
    const result = shithead_definition.validate_command(state, cmd)
    expect(result.valid).toBe(true)
  })

  it('returns PICK_UP_PILE when no card is playable', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '4'), make_card('clubs', '5')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
      discard_pile: [make_card('spades', 'K')],
    })

    const cmd = ismcts_compute_command(state, 'bot-1', TEST_CONFIG)
    expect(cmd.type).toBe('PICK_UP_PILE')
  })

  it('handles face-down cards', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [], face_up: [], face_down: [make_card('hearts', '7'), make_card('clubs', '9')] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
    })

    const cmd = ismcts_compute_command(state, 'bot-1', TEST_CONFIG)
    expect(cmd.type).toBe('PLAY_FACE_DOWN')
  })

  it('returns the only legal command when there is exactly one', () => {
    const state = make_play_state({
      players: new Map([
        ['bot-1', { hand: [make_card('hearts', '4')], face_up: [], face_down: [] }],
        ['p1', { hand: [make_card('spades', '3')], face_up: [], face_down: [] }],
      ]),
      discard_pile: [make_card('spades', 'K')],
    })

    // Only option is PICK_UP_PILE
    const cmd = ismcts_compute_command(state, 'bot-1', TEST_CONFIG)
    expect(cmd.type).toBe('PICK_UP_PILE')
  })

  it('produces valid moves throughout a full game', () => {
    const bot_players: Player[] = [
      { id: 'bot-1', name: 'Bot ISMCTS', connected: true },
      { id: 'bot-2', name: 'Bot Greedy', connected: true },
    ]

    let state = shithead_definition.initial_state(DEFAULT_SHITHEAD_CONFIG, bot_players)

    // Swap phase: both bots use greedy swap
    for (const bot_id of ['bot-1', 'bot-2']) {
      const ps = state.players.get(bot_id)!
      const cmds = compute_swap_commands(bot_id, ps.hand, ps.face_up)
      for (const cmd of cmds) {
        const result = shithead_definition.validate_command(state, cmd)
        expect(result.valid).toBe(true)
        state = shithead_definition.apply_command(state, cmd)
      }
    }

    expect(state.phase).toBe('play')

    // Play phase: bot-1 uses ISMCTS with small config, bot-2 uses ISMCTS too
    let turns = 0
    const max_turns = 500
    while (state.phase !== 'finished' && turns < max_turns) {
      const current_id = state.player_order[state.current_player_index]
      const cmd = ismcts_compute_command(state, current_id, TEST_CONFIG)
      const result = shithead_definition.validate_command(state, cmd)
      expect(result.valid, `ISMCTS command invalid on turn ${turns}: ${'reason' in result ? result.reason : ''}`).toBe(true)
      state = shithead_definition.apply_command(state, cmd)
      turns++
    }

    expect(state.phase).toBe('finished')
    expect(turns).toBeLessThan(max_turns)
  })
})
