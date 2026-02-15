import type { Card, Player, Validation_result } from '@shead/shared'
import { create_deck, shuffle } from '@shead/shared'
import type { Card_game_definition } from '@shead/game-engine'
import type {
  Gin_rummy_state,
  Gin_rummy_command,
  Gin_rummy_config,
  Gin_rummy_round_result,
  Visible_gin_rummy_state,
} from './types'
import { DEFAULT_GIN_RUMMY_CONFIG } from './types'
import {
  validate_meld_arrangement,
  calculate_deadwood_points,
  can_lay_off,
  is_valid_meld,
  find_optimal_melds,
} from './melds'

function clone_state(state: Gin_rummy_state): Gin_rummy_state {
  return {
    stock: [...state.stock],
    discard_pile: [...state.discard_pile],
    players: new Map(
      Array.from(state.players.entries()).map(([id, ps]) => [
        id,
        { hand: [...ps.hand] },
      ]),
    ),
    player_order: [...state.player_order] as [string, string],
    current_player: state.current_player,
    phase: state.phase,
    first_draw_passes: state.first_draw_passes,
    knocker_id: state.knocker_id,
    knocker_melds: state.knocker_melds ? state.knocker_melds.map(m => [...m]) : null,
    knocker_deadwood: state.knocker_deadwood ? [...state.knocker_deadwood] : null,
    defender_layoffs: state.defender_layoffs ? [...state.defender_layoffs] : null,
    scores: new Map(state.scores),
    round_history: [...state.round_history],
    dealer: state.dealer,
    target_score: state.target_score,
    round_number: state.round_number,
    last_drawn_from_discard_id: state.last_drawn_from_discard_id,
    last_drawn_card_id: state.last_drawn_card_id,
  }
}

function get_opponent(state: Gin_rummy_state, player_id: string): string {
  return state.player_order[0] === player_id ? state.player_order[1] : state.player_order[0]
}

function get_non_dealer(state: Gin_rummy_state): string {
  return state.player_order[0] === state.dealer ? state.player_order[1] : state.player_order[0]
}

function compute_deadwood_info(hand: Card[], phase: string, is_current: boolean): { own_deadwood_points: number; can_knock: boolean; can_gin: boolean } {
  const { deadwood } = find_optimal_melds(hand)
  const points = calculate_deadwood_points(deadwood)
  const in_discard = phase === 'discard' && is_current
  return {
    own_deadwood_points: points,
    can_knock: in_discard && points > 0 && points <= 10,
    can_gin: in_discard && points === 0,
  }
}

function deal_new_round(state: Gin_rummy_state): void {
  const deck = shuffle(create_deck())
  state.stock = deck
  state.discard_pile = []
  state.knocker_id = null
  state.knocker_melds = null
  state.knocker_deadwood = null
  state.defender_layoffs = null
  state.first_draw_passes = 0
  state.last_drawn_from_discard_id = null
  state.last_drawn_card_id = null
  state.round_number++

  // Swap dealer
  state.dealer = state.dealer === state.player_order[0] ? state.player_order[1] : state.player_order[0]

  // Deal 10 cards each
  for (const [, ps] of state.players) {
    ps.hand = state.stock.splice(0, 10)
  }

  // Flip one card to discard
  state.discard_pile.push(state.stock.shift()!)

  // Non-dealer goes first
  state.current_player = get_non_dealer(state)
  state.phase = 'first_draw'
}

function score_round(state: Gin_rummy_state): Gin_rummy_round_result {
  const knocker = state.knocker_id!
  const defender = get_opponent(state, knocker)
  const knocker_dw = state.knocker_deadwood ?? []
  const knocker_dw_points = calculate_deadwood_points(knocker_dw)

  // Calculate defender's best deadwood after layoffs
  const defender_hand = state.players.get(defender)!.hand
  const layoff_ids = new Set((state.defender_layoffs ?? []).map(c => c.id))
  const remaining_defender = defender_hand.filter(c => !layoff_ids.has(c.id))
  const { deadwood: defender_dw } = find_optimal_melds(remaining_defender)
  const defender_dw_points = calculate_deadwood_points(defender_dw)

  const is_gin = knocker_dw_points === 0

  let result: Gin_rummy_round_result

  if (is_gin) {
    // Gin bonus: defender deadwood + 25 points to knocker
    // Big gin: if knocker laid down all 11 cards (no discard)
    const knocker_hand = state.players.get(knocker)!.hand
    const is_big_gin = knocker_hand.length === 0 && (state.knocker_melds?.flat().length ?? 0) === 11
    const bonus = is_big_gin ? 31 : 25
    const points = defender_dw_points + bonus
    result = {
      round_number: state.round_number,
      winner: knocker,
      knocker,
      was_gin: true,
      was_undercut: false,
      points_awarded: points,
      knocker_deadwood: 0,
      defender_deadwood: defender_dw_points,
    }
  } else if (defender_dw_points <= knocker_dw_points) {
    // Undercut! Defender wins.
    const points = knocker_dw_points - defender_dw_points + 25
    result = {
      round_number: state.round_number,
      winner: defender,
      knocker,
      was_gin: false,
      was_undercut: true,
      points_awarded: points,
      knocker_deadwood: knocker_dw_points,
      defender_deadwood: defender_dw_points,
    }
  } else {
    // Normal knock win
    const points = knocker_dw_points - defender_dw_points
    result = {
      round_number: state.round_number,
      winner: knocker,
      knocker,
      was_gin: false,
      was_undercut: false,
      points_awarded: points,
      knocker_deadwood: knocker_dw_points,
      defender_deadwood: defender_dw_points,
    }
  }

  // Award points
  if (result.winner) {
    const current_score = state.scores.get(result.winner) ?? 0
    state.scores.set(result.winner, current_score + result.points_awarded)
  }

  state.round_history.push(result)
  return result
}

export const gin_rummy_definition: Card_game_definition<
  Gin_rummy_state,
  Gin_rummy_command,
  Gin_rummy_config
> = {
  id: 'gin-rummy',
  name: 'Gin Rummy',
  min_players: 2,
  max_players: 2,

  initial_state(config: Gin_rummy_config, players: Player[]): Gin_rummy_state {
    const target_score = config.target_score ?? DEFAULT_GIN_RUMMY_CONFIG.target_score ?? 100
    const deck = shuffle(create_deck())

    const player_map = new Map<string, { hand: Card[] }>()
    const p1 = players[0].id
    const p2 = players[1].id

    // Deal 10 cards each
    player_map.set(p1, { hand: deck.splice(0, 10) })
    player_map.set(p2, { hand: deck.splice(0, 10) })

    // Flip one card to discard
    const discard_pile = [deck.shift()!]

    const dealer = p1
    const non_dealer = p2

    return {
      stock: deck,
      discard_pile,
      players: player_map,
      player_order: [p1, p2],
      current_player: non_dealer,
      phase: 'first_draw',
      first_draw_passes: 0,
      knocker_id: null,
      knocker_melds: null,
      knocker_deadwood: null,
      defender_layoffs: null,
      scores: new Map([[p1, 0], [p2, 0]]),
      round_history: [],
      dealer,
      target_score,
      round_number: 1,
      last_drawn_from_discard_id: null,
      last_drawn_card_id: null,
    }
  },

  validate_command(state: Gin_rummy_state, cmd: Gin_rummy_command): Validation_result {
    const ps = state.players.get(cmd.player_id)
    if (!ps) return { valid: false, reason: 'Player not in game' }

    if (state.phase === 'finished') {
      return { valid: false, reason: 'Game is over' }
    }

    if (cmd.type === 'PASS_FIRST_DRAW') {
      if (state.phase !== 'first_draw') {
        return { valid: false, reason: 'Not in first draw phase' }
      }
      if (cmd.player_id !== state.current_player) {
        return { valid: false, reason: 'Not your turn' }
      }
      return { valid: true }
    }

    if (cmd.type === 'DRAW_DISCARD') {
      if (state.phase === 'first_draw') {
        if (cmd.player_id !== state.current_player) {
          return { valid: false, reason: 'Not your turn' }
        }
        if (state.discard_pile.length === 0) {
          return { valid: false, reason: 'Discard pile is empty' }
        }
        return { valid: true }
      }
      if (state.phase !== 'draw') {
        return { valid: false, reason: 'Not in draw phase' }
      }
      if (cmd.player_id !== state.current_player) {
        return { valid: false, reason: 'Not your turn' }
      }
      if (state.discard_pile.length === 0) {
        return { valid: false, reason: 'Discard pile is empty' }
      }
      return { valid: true }
    }

    if (cmd.type === 'DRAW_STOCK') {
      if (state.phase === 'first_draw') {
        // In first_draw, drawing from stock is only allowed if both players passed
        return { valid: false, reason: 'Must take discard or pass during first draw' }
      }
      if (state.phase !== 'draw') {
        return { valid: false, reason: 'Not in draw phase' }
      }
      if (cmd.player_id !== state.current_player) {
        return { valid: false, reason: 'Not your turn' }
      }
      if (state.stock.length <= 2) {
        return { valid: false, reason: 'Stock is too low' }
      }
      return { valid: true }
    }

    if (cmd.type === 'DISCARD') {
      if (state.phase !== 'discard') {
        return { valid: false, reason: 'Not in discard phase' }
      }
      if (cmd.player_id !== state.current_player) {
        return { valid: false, reason: 'Not your turn' }
      }
      const card = ps.hand.find(c => c.id === cmd.card_id)
      if (!card) {
        return { valid: false, reason: 'Card not in hand' }
      }
      if (state.last_drawn_from_discard_id && cmd.card_id === state.last_drawn_from_discard_id) {
        return { valid: false, reason: 'Cannot discard the card you just drew from the discard pile' }
      }
      return { valid: true }
    }

    if (cmd.type === 'KNOCK') {
      if (state.phase !== 'discard') {
        return { valid: false, reason: 'Can only knock during discard phase' }
      }
      if (cmd.player_id !== state.current_player) {
        return { valid: false, reason: 'Not your turn' }
      }
      // Validate melds and check deadwood <= 10
      const result = validate_meld_arrangement(ps.hand, cmd.melds)
      if (!result.valid) {
        return { valid: false, reason: result.reason }
      }
      const dw_points = calculate_deadwood_points(result.deadwood)
      if (dw_points > 10) {
        return { valid: false, reason: `Deadwood is ${dw_points} (must be 10 or less)` }
      }
      if (dw_points === 0) {
        return { valid: false, reason: 'Use GIN command for zero deadwood' }
      }
      return { valid: true }
    }

    if (cmd.type === 'GIN') {
      if (state.phase !== 'discard') {
        return { valid: false, reason: 'Can only gin during discard phase' }
      }
      if (cmd.player_id !== state.current_player) {
        return { valid: false, reason: 'Not your turn' }
      }
      const result = validate_meld_arrangement(ps.hand, cmd.melds)
      if (!result.valid) {
        return { valid: false, reason: result.reason }
      }
      if (result.deadwood.length > 0) {
        return { valid: false, reason: 'Gin requires zero deadwood' }
      }
      return { valid: true }
    }

    if (cmd.type === 'LAY_OFF') {
      if (state.phase !== 'knock_response') {
        return { valid: false, reason: 'Not in knock response phase' }
      }
      // Only defender can lay off
      if (cmd.player_id === state.knocker_id) {
        return { valid: false, reason: 'Knocker cannot lay off' }
      }
      if (cmd.player_id !== state.current_player) {
        return { valid: false, reason: 'Not your turn' }
      }
      if (!state.knocker_melds) {
        return { valid: false, reason: 'No melds to lay off on' }
      }
      if (cmd.meld_index < 0 || cmd.meld_index >= state.knocker_melds.length) {
        return { valid: false, reason: 'Invalid meld index' }
      }
      // Validate cards exist in hand
      for (const card_id of cmd.card_ids) {
        if (!ps.hand.find(c => c.id === card_id)) {
          return { valid: false, reason: `Card ${card_id} not in hand` }
        }
      }
      // Validate the cards can actually be laid off on the meld
      const meld = state.knocker_melds[cmd.meld_index]
      const extended = [...meld]
      for (const card_id of cmd.card_ids) {
        const card = ps.hand.find(c => c.id === card_id)!
        extended.push(card)
      }
      if (!is_valid_meld(extended)) {
        return { valid: false, reason: 'Cards do not extend the meld' }
      }
      return { valid: true }
    }

    if (cmd.type === 'ACCEPT_KNOCK') {
      if (state.phase !== 'knock_response') {
        return { valid: false, reason: 'Not in knock response phase' }
      }
      if (cmd.player_id === state.knocker_id) {
        return { valid: false, reason: 'Knocker cannot accept their own knock' }
      }
      if (cmd.player_id !== state.current_player) {
        return { valid: false, reason: 'Not your turn' }
      }
      return { valid: true }
    }

    if (cmd.type === 'NEXT_ROUND') {
      if (state.phase !== 'round_over') {
        return { valid: false, reason: 'Round is not over' }
      }
      return { valid: true }
    }

    return { valid: false, reason: 'Unknown command type' }
  },

  apply_command(state: Gin_rummy_state, cmd: Gin_rummy_command): Gin_rummy_state {
    const next = clone_state(state)

    if (cmd.type === 'PASS_FIRST_DRAW') {
      next.first_draw_passes++
      if (next.first_draw_passes >= 2) {
        // Both passed — non-dealer must draw from stock
        next.current_player = get_non_dealer(next)
        next.phase = 'draw'
      } else {
        // Pass to dealer
        next.current_player = next.dealer
      }
      return next
    }

    if (cmd.type === 'DRAW_DISCARD') {
      const ps = next.players.get(cmd.player_id)!
      const card = next.discard_pile.pop()!
      ps.hand.push(card)
      next.last_drawn_from_discard_id = card.id
      next.last_drawn_card_id = card.id
      if (next.phase === 'first_draw') {
        next.phase = 'discard'
      } else {
        next.phase = 'discard'
      }
      return next
    }

    if (cmd.type === 'DRAW_STOCK') {
      const ps = next.players.get(cmd.player_id)!
      const card = next.stock.shift()!
      ps.hand.push(card)
      next.last_drawn_from_discard_id = null
      next.last_drawn_card_id = card.id

      // Check stock exhaustion: if 2 or fewer cards remain after draw, round is a draw
      if (next.stock.length <= 2) {
        next.phase = 'round_over'
        const draw_result: Gin_rummy_round_result = {
          round_number: next.round_number,
          winner: null,
          knocker: null,
          was_gin: false,
          was_undercut: false,
          points_awarded: 0,
          knocker_deadwood: 0,
          defender_deadwood: 0,
        }
        next.round_history.push(draw_result)
        return next
      }

      next.phase = 'discard'
      return next
    }

    if (cmd.type === 'DISCARD') {
      const ps = next.players.get(cmd.player_id)!
      const idx = ps.hand.findIndex(c => c.id === cmd.card_id)
      const card = ps.hand[idx]
      ps.hand.splice(idx, 1)
      next.discard_pile.push(card)
      next.last_drawn_from_discard_id = null
      next.last_drawn_card_id = null

      // Swap turn
      const opponent = get_opponent(next, cmd.player_id)
      next.current_player = opponent

      // Check stock exhaustion
      if (next.stock.length <= 2) {
        next.phase = 'round_over'
        const draw_result: Gin_rummy_round_result = {
          round_number: next.round_number,
          winner: null,
          knocker: null,
          was_gin: false,
          was_undercut: false,
          points_awarded: 0,
          knocker_deadwood: 0,
          defender_deadwood: 0,
        }
        next.round_history.push(draw_result)
        return next
      }

      next.phase = 'draw'
      return next
    }

    if (cmd.type === 'KNOCK') {
      const ps = next.players.get(cmd.player_id)!
      const result = validate_meld_arrangement(ps.hand, cmd.melds)
      if (!result.valid) return next // should not happen (validated)

      const hand_map = new Map(ps.hand.map(c => [c.id, c]))
      next.knocker_id = cmd.player_id
      next.knocker_melds = cmd.melds.map(meld_ids => meld_ids.map(id => hand_map.get(id)!))
      next.knocker_deadwood = result.deadwood
      next.defender_layoffs = []

      // Transition to knock_response — defender's turn
      const defender = get_opponent(next, cmd.player_id)
      next.current_player = defender
      next.phase = 'knock_response'
      return next
    }

    if (cmd.type === 'GIN') {
      const ps = next.players.get(cmd.player_id)!
      const hand_map = new Map(ps.hand.map(c => [c.id, c]))
      next.knocker_id = cmd.player_id
      next.knocker_melds = cmd.melds.map(meld_ids => meld_ids.map(id => hand_map.get(id)!))
      next.knocker_deadwood = []
      next.defender_layoffs = []

      // Score immediately for gin (no layoffs allowed)
      score_round(next)
      next.phase = 'round_over'

      // Check if game is over
      for (const [, score] of next.scores) {
        if (score >= next.target_score) {
          next.phase = 'finished'
          break
        }
      }
      return next
    }

    if (cmd.type === 'LAY_OFF') {
      const ps = next.players.get(cmd.player_id)!
      const cards: Card[] = []
      for (const card_id of cmd.card_ids) {
        const idx = ps.hand.findIndex(c => c.id === card_id)
        cards.push(ps.hand[idx])
        ps.hand.splice(idx, 1)
      }

      // Add to the knocker's meld
      if (next.knocker_melds) {
        next.knocker_melds[cmd.meld_index].push(...cards)
      }

      // Track defender layoffs
      if (!next.defender_layoffs) next.defender_layoffs = []
      next.defender_layoffs.push(...cards)

      return next
    }

    if (cmd.type === 'ACCEPT_KNOCK') {
      // Score the round
      score_round(next)
      next.phase = 'round_over'

      // Check if game is over
      for (const [, score] of next.scores) {
        if (score >= next.target_score) {
          next.phase = 'finished'
          break
        }
      }
      return next
    }

    if (cmd.type === 'NEXT_ROUND') {
      deal_new_round(next)
      return next
    }

    return next
  },

  get_visible_state(state: Gin_rummy_state, player_id: string): Visible_gin_rummy_state {
    const opponent_id = get_opponent(state, player_id)
    const own = state.players.get(player_id)!
    const opp = state.players.get(opponent_id)!

    const scores: Record<string, number> = {}
    for (const [id, score] of state.scores) {
      scores[id] = score
    }

    // Show opponent hand during knock_response and round_over
    const show_opponent = state.phase === 'knock_response' || state.phase === 'round_over'

    return {
      discard_top: state.discard_pile.length > 0 ? state.discard_pile[state.discard_pile.length - 1] : null,
      stock_count: state.stock.length,
      opponent: { hand_count: opp.hand.length },
      opponent_id,
      own_hand: [...own.hand],
      current_player: state.current_player,
      phase: state.phase,
      player_order: [...state.player_order] as [string, string],
      scores,
      round_history: [...state.round_history],
      round_number: state.round_number,
      target_score: state.target_score,
      knocker_id: state.knocker_id,
      knocker_melds: state.knocker_melds ? state.knocker_melds.map(m => [...m]) : null,
      knocker_deadwood: state.knocker_deadwood ? [...state.knocker_deadwood] : null,
      defender_layoffs: state.defender_layoffs ? [...state.defender_layoffs] : null,
      opponent_hand: show_opponent ? [...opp.hand] : null,
      last_drawn_from_discard_id: player_id === state.current_player ? state.last_drawn_from_discard_id : null,
      last_drawn_card_id: player_id === state.current_player ? state.last_drawn_card_id : null,
      ...compute_deadwood_info(own.hand, state.phase, state.current_player === player_id),
    }
  },

  is_game_over(state: Gin_rummy_state): boolean {
    return state.phase === 'finished'
  },

  get_scores(state: Gin_rummy_state): Map<string, number> {
    return new Map(state.scores)
  },
}
