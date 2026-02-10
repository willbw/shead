import type { Card, Player, Validation_result } from '@shead/shared'
import { create_deck, shuffle, can_play_on, RANK_VALUES, effective_top_card, Direction } from '@shead/shared'
import type { Card_game_definition } from '@shead/game-engine'
import type {
  Shithead_command,
  Shithead_config,
  Shithead_state,
  Visible_shithead_state,
  Visible_player_state,
  Visible_own_player_state,
} from './types'
import { DEFAULT_SHITHEAD_CONFIG } from './types'

function top_card(pile: Card[]): Card | undefined {
  return pile[pile.length - 1]
}

function all_same_rank(cards: Card[]): boolean {
  if (cards.length === 0) return true
  const rank = cards[0].rank
  return cards.every((c) => c.rank === rank)
}

function check_four_of_a_kind_burn(pile: Card[]): boolean {
  if (pile.length < 4) return false
  const top_four = pile.slice(-4)
  return all_same_rank(top_four)
}

function get_current_player(state: Shithead_state): string {
  return state.player_order[state.current_player_index]
}

function advance_turn(state: Shithead_state, steps = 1): number {
  const len = state.player_order.length
  return ((state.current_player_index + state.direction * steps) % len + len) % len
}

function find_card_in_list(cards: Card[], card_id: string): number {
  return cards.findIndex((c) => c.id === card_id)
}

function remove_card(cards: Card[], card_id: string): { card: Card; remaining: Card[] } | null {
  const index = find_card_in_list(cards, card_id)
  if (index === -1) return null
  const card = cards[index]
  const remaining = [...cards.slice(0, index), ...cards.slice(index + 1)]
  return { card, remaining }
}

function draw_cards(deck: Card[], count: number): { drawn: Card[]; remaining: Card[] } {
  const actual = Math.min(count, deck.length)
  return {
    drawn: deck.slice(0, actual),
    remaining: deck.slice(actual),
  }
}

function get_playable_source(player_state: { hand: Card[]; face_up: Card[]; face_down: Card[] }):
  'hand' | 'face_up' | 'face_down' {
  if (player_state.hand.length > 0) return 'hand'
  if (player_state.face_up.length > 0) return 'face_up'
  return 'face_down'
}

function clone_state(state: Shithead_state): Shithead_state {
  return {
    deck: [...state.deck],
    discard_pile: [...state.discard_pile],
    players: new Map(
      Array.from(state.players.entries()).map(([id, ps]) => [
        id,
        {
          hand: [...ps.hand],
          face_up: [...ps.face_up],
          face_down: [...ps.face_down],
        },
      ]),
    ),
    player_order: [...state.player_order],
    current_player_index: state.current_player_index,
    direction: state.direction,
    phase: state.phase,
    ready_players: new Set(state.ready_players),
    last_effect: state.last_effect,
  }
}

function is_player_out(player_state: { hand: Card[]; face_up: Card[]; face_down: Card[] }): boolean {
  return player_state.hand.length === 0
    && player_state.face_up.length === 0
    && player_state.face_down.length === 0
}

export const shithead_definition: Card_game_definition<
  Shithead_state,
  Shithead_command,
  Shithead_config
> = {
  id: 'shithead',
  name: 'Shithead',
  min_players: 2,
  max_players: 5,

  initial_state(config: Shithead_config, players: Player[]): Shithead_state {
    const cfg = { ...DEFAULT_SHITHEAD_CONFIG, ...config }
    const deck = shuffle(create_deck())
    const player_map = new Map<string, { hand: Card[]; face_up: Card[]; face_down: Card[] }>()
    let deck_index = 0

    for (const player of players) {
      const face_down = deck.slice(deck_index, deck_index + cfg.num_face_down)
      deck_index += cfg.num_face_down

      const face_up = deck.slice(deck_index, deck_index + cfg.num_face_up)
      deck_index += cfg.num_face_up

      const hand = deck.slice(deck_index, deck_index + cfg.num_hand)
      deck_index += cfg.num_hand

      player_map.set(player.id, { hand, face_up, face_down })
    }

    return {
      deck: deck.slice(deck_index),
      discard_pile: [],
      players: player_map,
      player_order: players.map((p) => p.id),
      current_player_index: 0,
      direction: Direction.CLOCKWISE,
      phase: 'swap',
      ready_players: new Set(),
      last_effect: null,
    }
  },

  validate_command(state: Shithead_state, cmd: Shithead_command): Validation_result {
    const player_state = state.players.get(cmd.player_id)
    if (!player_state) {
      return { valid: false, reason: 'Player not in game' }
    }

    if (state.phase === 'finished') {
      return { valid: false, reason: 'Game is over' }
    }

    if (cmd.type === 'SWAP_CARD') {
      if (state.phase !== 'swap') {
        return { valid: false, reason: 'Swapping is only allowed during swap phase' }
      }
      if (find_card_in_list(player_state.hand, cmd.hand_card_id) === -1) {
        return { valid: false, reason: 'Card not in hand' }
      }
      if (find_card_in_list(player_state.face_up, cmd.face_up_card_id) === -1) {
        return { valid: false, reason: 'Card not in face-up pile' }
      }
      return { valid: true }
    }

    if (cmd.type === 'READY') {
      if (state.phase !== 'swap') {
        return { valid: false, reason: 'Ready is only valid during swap phase' }
      }
      if (state.ready_players.has(cmd.player_id)) {
        return { valid: false, reason: 'Already ready' }
      }
      return { valid: true }
    }

    if (cmd.type === 'UNREADY') {
      if (state.phase !== 'swap') {
        return { valid: false, reason: 'Unready is only valid during swap phase' }
      }
      if (!state.ready_players.has(cmd.player_id)) {
        return { valid: false, reason: 'Not ready yet' }
      }
      return { valid: true }
    }

    // Play-phase commands require it to be your turn
    if (state.phase !== 'play') {
      return { valid: false, reason: 'Game has not started yet' }
    }

    const current_player = get_current_player(state)
    if (cmd.player_id !== current_player) {
      return { valid: false, reason: 'Not your turn' }
    }

    if (cmd.type === 'PICK_UP_PILE') {
      if (state.discard_pile.length === 0) {
        return { valid: false, reason: 'Pile is empty' }
      }
      return { valid: true }
    }

    if (cmd.type === 'PLAY_CARD') {
      if (cmd.card_ids.length === 0) {
        return { valid: false, reason: 'Must play at least one card' }
      }

      const source = get_playable_source(player_state)

      // Playing from face-down is always blind — only one card at a time
      if (source === 'face_down') {
        if (cmd.card_ids.length !== 1) {
          return { valid: false, reason: 'Can only play one face-down card at a time' }
        }
        if (find_card_in_list(player_state.face_down, cmd.card_ids[0]) === -1) {
          return { valid: false, reason: 'Card not in face-down pile' }
        }
        // Face-down plays are blind — always valid structurally, but might fail on the pile
        return { valid: true }
      }

      const source_cards = source === 'hand' ? player_state.hand : player_state.face_up

      // Validate all cards exist in the source
      const cards: Card[] = []
      for (const card_id of cmd.card_ids) {
        const card = source_cards.find((c) => c.id === card_id)
        if (!card) {
          return { valid: false, reason: `Card ${card_id} not found in ${source}` }
        }
        cards.push(card)
      }

      // All cards must be the same rank
      if (!all_same_rank(cards)) {
        return { valid: false, reason: 'All played cards must be the same rank' }
      }

      // Check if the card can be played on the pile
      if (!can_play_on(cards[0], state.discard_pile)) {
        return { valid: false, reason: 'Cannot play that card on the pile' }
      }

      return { valid: true }
    }

    return { valid: false, reason: 'Unknown command type' }
  },

  apply_command(state: Shithead_state, cmd: Shithead_command): Shithead_state {
    const next = clone_state(state)

    if (cmd.type === 'SWAP_CARD') {
      const ps = next.players.get(cmd.player_id)!
      const hand_result = remove_card(ps.hand, cmd.hand_card_id)!
      const face_up_result = remove_card(ps.face_up, cmd.face_up_card_id)!
      ps.hand = [...hand_result.remaining, face_up_result.card]
      ps.face_up = [...face_up_result.remaining, hand_result.card]
      return next
    }

    if (cmd.type === 'READY') {
      next.ready_players.add(cmd.player_id)
      // If all players are ready, transition to play phase
      if (next.ready_players.size === next.player_order.length) {
        next.phase = 'play'
      }
      return next
    }

    if (cmd.type === 'UNREADY') {
      next.ready_players.delete(cmd.player_id)
      return next
    }

    if (cmd.type === 'PICK_UP_PILE') {
      const ps = next.players.get(cmd.player_id)!
      ps.hand = [...ps.hand, ...next.discard_pile]
      next.discard_pile = []
      next.last_effect = null
      next.current_player_index = advance_turn(next)
      return next
    }

    if (cmd.type === 'PLAY_CARD') {
      const ps = next.players.get(cmd.player_id)!
      const source = get_playable_source(ps)

      if (source === 'face_down') {
        // Blind play from face-down
        const card_id = cmd.card_ids[0]
        const result = remove_card(ps.face_down, card_id)!
        const card = result.card
        ps.face_down = result.remaining

        // If the card can't be played, pick up the pile + the card
        if (!can_play_on(card, next.discard_pile)) {
          ps.hand = [...ps.hand, ...next.discard_pile, card]
          next.discard_pile = []
          next.last_effect = null
          next.current_player_index = advance_turn(next)
          return next
        }

        // Card can be played
        next.discard_pile.push(card)
      } else {
        // Play from hand or face-up
        const source_cards = source === 'hand' ? ps.hand : ps.face_up
        const played_cards: Card[] = []
        let remaining = [...source_cards]

        for (const card_id of cmd.card_ids) {
          const result = remove_card(remaining, card_id)!
          played_cards.push(result.card)
          remaining = result.remaining
        }

        if (source === 'hand') {
          ps.hand = remaining
        } else {
          ps.face_up = remaining
        }

        next.discard_pile.push(...played_cards)
      }

      // Check for special card effects
      const played_rank = top_card(next.discard_pile)?.rank
      const num_played = cmd.card_ids.length

      if (played_rank === '10' || check_four_of_a_kind_burn(next.discard_pile)) {
        // Burn: clear pile, same player goes again
        next.discard_pile = []
        next.last_effect = 'burn'
      } else if (played_rank === 'Q') {
        // Reverse direction (odd number of Qs flips, even cancels)
        if (num_played % 2 === 1) {
          next.direction = next.direction === Direction.CLOCKWISE ? Direction.COUNTER_CLOCKWISE : Direction.CLOCKWISE
          next.last_effect = 'reverse'
        } else {
          next.last_effect = null
        }
        // In 2-player with odd Qs, same player goes again
        if (next.player_order.length === 2 && num_played % 2 === 1) {
          // Don't advance — acts like skip in 2-player
        } else {
          next.current_player_index = advance_turn(next)
        }
      } else if (played_rank === '8') {
        // Skip: advance 1 + num_played (skip N players for N 8s)
        next.last_effect = 'skip'
        next.current_player_index = advance_turn(next, 1 + num_played)
      } else {
        next.last_effect = null
        next.current_player_index = advance_turn(next)
      }

      // Draw back up to hand size if cards remain in deck
      if (source === 'hand' && next.deck.length > 0) {
        const deficit = cmd.card_ids.length
        const { drawn, remaining } = draw_cards(next.deck, deficit)
        ps.hand = [...ps.hand, ...drawn]
        next.deck = remaining
      }

      // Check if the player who just played is now out
      if (is_player_out(ps)) {
        // Remove them from player_order
        const player_idx = next.player_order.indexOf(cmd.player_id)
        next.player_order.splice(player_idx, 1)

        // Adjust current_player_index
        if (next.player_order.length <= 1) {
          next.phase = 'finished'
          return next
        }

        // If the removed player was before or at current index, shift back
        if (next.current_player_index > player_idx) {
          next.current_player_index--
        }
        // Wrap around
        next.current_player_index = next.current_player_index % next.player_order.length
      }

      return next
    }

    return next
  },

  get_visible_state(state: Shithead_state, player_id: string): Visible_shithead_state {
    const own = state.players.get(player_id)
    const players: Record<string, Visible_player_state> = {}

    for (const [id, ps] of state.players) {
      if (id === player_id) continue
      players[id] = {
        hand_count: ps.hand.length,
        face_up: [...ps.face_up],
        face_down_count: ps.face_down.length,
      }
    }

    const own_state: Visible_own_player_state = own
      ? { hand: [...own.hand], face_up: [...own.face_up], face_down_count: own.face_down.length }
      : { hand: [], face_up: [], face_down_count: 0 }

    return {
      discard_pile: [...state.discard_pile],
      deck_count: state.deck.length,
      players,
      own_state,
      current_player: get_current_player(state),
      phase: state.phase,
      player_order: [...state.player_order],
      direction: state.direction,
      ready_players: [...state.ready_players],
      last_effect: state.last_effect,
    }
  },

  is_game_over(state: Shithead_state): boolean {
    return state.phase === 'finished'
  },

  get_scores(state: Shithead_state): Map<string, number> {
    const scores = new Map<string, number>()
    // The last player remaining is the "shithead" (loser) — score 0
    // Players who went out earlier get higher scores
    // Since player_order only has remaining players, they're losers
    for (const id of state.player_order) {
      scores.set(id, 0)
    }
    // Players no longer in player_order have won (went out)
    for (const id of state.players.keys()) {
      if (!state.player_order.includes(id)) {
        scores.set(id, 1)
      }
    }
    return scores
  },
}
