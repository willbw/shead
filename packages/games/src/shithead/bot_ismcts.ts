import type { Card, Rank } from '@shead/shared'
import { shuffle, can_play_on, RANK_VALUES } from '@shead/shared'
import type { Shithead_state, Shithead_command } from './types'
import { clone_state, shithead_definition } from './definition'
import { compute_play_command } from './bot'

export interface Ismcts_config {
  num_determinizations: number
  num_rollouts_per_determinization: number
}

export const MEDIUM_CONFIG: Ismcts_config = {
  num_determinizations: 100,
  num_rollouts_per_determinization: 50,
}

export const HARD_CONFIG: Ismcts_config = {
  num_determinizations: 100,
  num_rollouts_per_determinization: 100,
}

const UCB1_C = 1.41

interface Mcts_node {
  command: Shithead_command | null // null for root
  parent: Mcts_node | null
  children: Mcts_node[]
  visits: number
  total_reward: number
  untried_commands: Shithead_command[]
}

function create_node(command: Shithead_command | null, parent: Mcts_node | null, untried: Shithead_command[]): Mcts_node {
  return {
    command,
    parent,
    children: [],
    visits: 0,
    total_reward: 0,
    untried_commands: untried,
  }
}

/** Get all valid commands for the current player in a play-phase state. */
function get_legal_commands(state: Shithead_state, player_id: string): Shithead_command[] {
  const ps = state.players.get(player_id)
  if (!ps) return []

  const source = ps.hand.length > 0 ? 'hand' : ps.face_up.length > 0 ? 'face_up' : 'face_down'

  if (source === 'face_down') {
    // Can play any face-down card (each index is a separate action)
    const cmds: Shithead_command[] = []
    for (let i = 0; i < ps.face_down.length; i++) {
      cmds.push({ player_id, type: 'PLAY_FACE_DOWN', index: i })
    }
    return cmds
  }

  const available = source === 'hand' ? ps.hand : ps.face_up
  const playable = available.filter(c => can_play_on(c, state.discard_pile))

  if (playable.length === 0) {
    if (state.discard_pile.length > 0) {
      return [{ player_id, type: 'PICK_UP_PILE' }]
    }
    return []
  }

  // Group playable cards by rank — each group is a possible action
  // Also allow playing subsets (e.g. 1 of 2 fives, or both fives)
  const by_rank = new Map<Rank, Card[]>()
  for (const c of playable) {
    const group = by_rank.get(c.rank) ?? []
    group.push(c)
    by_rank.set(c.rank, group)
  }

  const cmds: Shithead_command[] = []
  for (const [, cards] of by_rank) {
    // Generate all possible counts: play 1, play 2, ..., play all of this rank
    for (let count = 1; count <= cards.length; count++) {
      // Just use the first `count` cards of this rank (order doesn't matter)
      const selection = cards.slice(0, count)
      cmds.push({
        player_id,
        type: 'PLAY_CARD',
        card_ids: selection.map(c => c.id),
      })
    }
  }

  return cmds
}

/** Determinize: fill in hidden information with a random consistent assignment.
 *  From bot_player_id's perspective, the bot knows its own cards. Other players'
 *  hands and face-down cards are unknown and get shuffled from the "unseen" pool. */
function determinize(state: Shithead_state, bot_player_id: string): Shithead_state {
  const det = clone_state(state)

  // Collect all cards that the bot cannot see
  const unseen: Card[] = [...det.deck]
  for (const [pid, ps] of det.players) {
    if (pid === bot_player_id) {
      // Bot knows its own face-down cards on the server (full state)
      continue
    }
    // Opponent's hand and face-down are unknown
    unseen.push(...ps.hand)
    unseen.push(...ps.face_down)
    ps.hand = []
    ps.face_down = []
  }

  // Shuffle unseen cards
  const shuffled = shuffle(unseen)
  let idx = 0

  // Redistribute: each opponent gets back the same count of hand/face-down cards
  for (const [pid, ps] of det.players) {
    if (pid === bot_player_id) continue
    const orig = state.players.get(pid)!
    const hand_count = orig.hand.length
    const fd_count = orig.face_down.length
    ps.hand = shuffled.slice(idx, idx + hand_count)
    idx += hand_count
    ps.face_down = shuffled.slice(idx, idx + fd_count)
    idx += fd_count
  }

  // Remaining unseen cards go back to deck
  det.deck = shuffled.slice(idx)

  return det
}

/** Fast greedy rollout — use the simple bot strategy for all players. */
function rollout(state: Shithead_state, bot_player_id: string): number {
  let s = state
  let turns = 0
  const max_turns = 200

  while (s.phase !== 'finished' && turns < max_turns) {
    const current_id = s.player_order[s.current_player_index]
    const cmd = compute_play_command(s, current_id)
    const validation = shithead_definition.validate_command(s, cmd)
    if (!validation.valid) break
    s = shithead_definition.apply_command(s, cmd)
    turns++
  }

  if (s.phase !== 'finished') return 0.5 // draw / timeout

  // Bot wins (not in player_order = went out) → 1, still in player_order → 0
  return s.player_order.includes(bot_player_id) ? 0 : 1
}

/** UCB1 selection: pick the child with the highest UCB1 score. */
function select_child(node: Mcts_node): Mcts_node {
  let best: Mcts_node | null = null
  let best_score = -Infinity

  const parent_log = Math.log(node.visits)
  for (const child of node.children) {
    const exploitation = child.total_reward / child.visits
    const exploration = UCB1_C * Math.sqrt(parent_log / child.visits)
    const score = exploitation + exploration
    if (score > best_score) {
      best_score = score
      best = child
    }
  }

  return best!
}

/** Run a single MCTS iteration on a determinized state. */
function mcts_iterate(root: Mcts_node, state: Shithead_state, bot_player_id: string): void {
  let node = root
  let s = clone_state(state)

  // Selection: descend tree using UCB1 until we reach a node with untried actions or a terminal
  while (node.untried_commands.length === 0 && node.children.length > 0) {
    node = select_child(node)
    const validation = shithead_definition.validate_command(s, node.command!)
    if (!validation.valid) {
      // Invalid command in this determinization — treat as loss
      backpropagate(node, 0)
      return
    }
    s = shithead_definition.apply_command(s, node.command!)
    if (s.phase === 'finished') {
      const reward = s.player_order.includes(bot_player_id) ? 0 : 1
      backpropagate(node, reward)
      return
    }
  }

  // Expansion: if there are untried commands, pick one
  if (node.untried_commands.length > 0) {
    const idx = Math.floor(Math.random() * node.untried_commands.length)
    const cmd = node.untried_commands.splice(idx, 1)[0]
    const validation = shithead_definition.validate_command(s, cmd)
    if (!validation.valid) {
      backpropagate(node, 0)
      return
    }
    s = shithead_definition.apply_command(s, cmd)

    // Create child node
    let child_untried: Shithead_command[] = []
    if (s.phase !== 'finished') {
      const next_player = s.player_order[s.current_player_index]
      child_untried = get_legal_commands(s, next_player)
    }
    const child = create_node(cmd, node, child_untried)
    node.children.push(child)
    node = child
  }

  // Rollout
  const reward = s.phase === 'finished'
    ? (s.player_order.includes(bot_player_id) ? 0 : 1)
    : rollout(s, bot_player_id)

  backpropagate(node, reward)
}

function backpropagate(node: Mcts_node | null, reward: number): void {
  while (node !== null) {
    node.visits++
    node.total_reward += reward
    node = node.parent
  }
}

/** Run ISMCTS to pick the best command for the bot. */
export function ismcts_compute_command(
  state: Shithead_state,
  bot_player_id: string,
  config: Ismcts_config,
): Shithead_command {
  const legal = get_legal_commands(state, bot_player_id)
  if (legal.length === 0) {
    return { player_id: bot_player_id, type: 'PICK_UP_PILE' }
  }
  if (legal.length === 1) {
    return legal[0]
  }

  // Aggregate stats across determinizations using command keys
  const aggregate_visits = new Map<string, number>()
  const aggregate_reward = new Map<string, number>()
  const command_map = new Map<string, Shithead_command>()

  for (const cmd of legal) {
    const key = command_key(cmd)
    aggregate_visits.set(key, 0)
    aggregate_reward.set(key, 0)
    command_map.set(key, cmd)
  }

  for (let d = 0; d < config.num_determinizations; d++) {
    const det = determinize(state, bot_player_id)

    // Filter legal commands to only those valid in this determinization
    const det_legal = legal.filter(cmd =>
      shithead_definition.validate_command(det, cmd).valid
    )
    if (det_legal.length === 0) continue

    const root = create_node(null, null, [...det_legal])

    for (let r = 0; r < config.num_rollouts_per_determinization; r++) {
      mcts_iterate(root, det, bot_player_id)
    }

    // Collect stats from root's children
    for (const child of root.children) {
      if (!child.command) continue
      const key = command_key(child.command)
      aggregate_visits.set(key, (aggregate_visits.get(key) ?? 0) + child.visits)
      aggregate_reward.set(key, (aggregate_reward.get(key) ?? 0) + child.total_reward)
    }
  }

  // Pick command with highest total visits
  let best_key = ''
  let best_visits = -1
  for (const [key, visits] of aggregate_visits) {
    if (visits > best_visits) {
      best_visits = visits
      best_key = key
    }
  }

  return command_map.get(best_key) ?? legal[0]
}

/** Create a stable string key for a command so we can aggregate across determinizations. */
function command_key(cmd: Shithead_command): string {
  switch (cmd.type) {
    case 'PLAY_CARD':
      return `PLAY_CARD:${[...cmd.card_ids].sort().join(',')}`
    case 'PICK_UP_PILE':
      return 'PICK_UP_PILE'
    case 'PLAY_FACE_DOWN':
      return `PLAY_FACE_DOWN:${cmd.index}`
    default:
      return cmd.type
  }
}
