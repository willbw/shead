<script lang="ts">
	import { untrack } from 'svelte'
	import { goto } from '$app/navigation'
	import { connection_store } from '$lib/stores/connection.svelte'
	import { lobby_store } from '$lib/stores/lobby.svelte'
	import { game_store } from '$lib/stores/game.svelte'
	import type { Visible_shithead_state } from '$lib/stores/game.svelte'
	import { effective_top_card, can_play_on, RANK_VALUES, DEFAULT_RULESET } from '@shead/shared'
	import type { Card } from '@shead/shared'
	import { connect, set_name, join_room, leave_room, start_game, send_command, reconnecting } from '$lib/socket.svelte'
	import { fly } from 'svelte/transition'
	import CardComponent from '$lib/components/card.svelte'
	import CardBack from '$lib/components/card_back.svelte'
	import PlayerHand from '$lib/components/player_hand.svelte'
	import OpponentZone from '$lib/components/opponent_zone.svelte'
	import GameStatus from '$lib/components/game_status.svelte'
	import GinRummyGameTable from '$lib/components/gin_rummy/game_table.svelte'

	let { data } = $props()
	const room_id = $derived(data.room_id)

	let name_input = $state('')
	let join_error = $state('')
	let join_loading = $state(false)
	let copied = $state(false)
	let revealing = $state(false)

	const game_type = $derived(lobby_store.room?.game_type ?? 'shithead')

	// Connect if not yet
	$effect(() => {
		if (!connection_store.connected) {
			connect()
		}
	})

	// Already in this room AND have a name (reconnect or already joined)
	const in_room = $derived(lobby_store.room?.room_id === room_id && !!connection_store.player_name)

	// Already in this room's socket room but haven't set name yet (creator flow)
	const in_room_no_name = $derived(lobby_store.room?.room_id === room_id && !connection_store.player_name)

	// Redirect home if connected, no room, done reconnecting, and not mid-join
	$effect(() => {
		if (connection_store.connected && !lobby_store.room && !reconnecting.value && !join_loading && connection_store.player_name) {
			goto('/')
		}
	})

	async function handle_join() {
		const name = name_input.trim()
		if (!name) return
		join_error = ''
		join_loading = true
		try {
			await set_name(name)
			if (!in_room_no_name) {
				await join_room(room_id)
			}
		} catch (e) {
			join_error = (e as Error).message
		} finally {
			join_loading = false
		}
	}

	function handle_dismiss_error() {
		game_store.error_message = null
	}

	async function copy_room_link() {
		try {
			await navigator.clipboard.writeText(window.location.href)
			copied = true
			setTimeout(() => { copied = false }, 2000)
		} catch {
			// fallback: select-all on the text
		}
	}

	async function handle_leave() {
		try {
			await leave_room()
		} catch {
			// ignore
		}
		goto('/')
	}

	const room = $derived(lobby_store.room)
	const gs = $derived(game_store.game_state as Visible_shithead_state | null)
	const my_id = $derived(connection_store.player_id)

	// For swap phase: track which hand card is selected for swapping
	let swap_hand_card_id = $state<string | null>(null)

	const is_my_turn = $derived(gs ? gs.current_player === my_id : false)

	const has_playable_card = $derived.by(() => {
		if (!gs || gs.phase !== 'play') return false
		const own = gs.own_state
		const source = own.hand.length > 0 ? own.hand : own.face_up
		return source.some(card => can_play_on(card, gs.discard_pile))
	})

	const can_complete_four_of_a_kind = $derived.by(() => {
		if (!gs || gs.phase !== 'play' || is_my_turn) return false
		const ids = game_store.selected_card_ids
		if (ids.length === 0) return false
		const own = gs.own_state
		const all_cards = [...own.hand, ...own.face_up]
		const cards = ids.map(id => all_cards.find(c => c.id === id)).filter(Boolean) as typeof all_cards
		if (cards.length !== ids.length) return false
		if (cards.length === 0) return false
		const rank = cards[0].rank
		if (!cards.every(c => c.rank === rank)) return false
		let pile_matching = 0
		for (let i = gs.discard_pile.length - 1; i >= 0; i--) {
			if (gs.discard_pile[i].rank === rank) pile_matching++
			else break
		}
		return pile_matching + cards.length >= 4
	})

	// Detect if it's our turn and we can complete a four-of-a-kind from our cards
	const four_of_a_kind_cards = $derived.by((): Card[] | null => {
		if (!gs || gs.phase !== 'play' || !is_my_turn) return null
		if (gs.discard_pile.length === 0) return null
		const pile = gs.discard_pile
		const top_rank = pile[pile.length - 1].rank
		let pile_count = 0
		for (let i = pile.length - 1; i >= 0; i--) {
			if (pile[i].rank === top_rank) pile_count++
			else break
		}
		if (pile_count >= 4) return null // already burned
		const needed = 4 - pile_count
		const own = gs.own_state
		const source = own.hand.length > 0 ? own.hand : own.face_up
		const matching = source.filter(c => c.rank === top_rank && can_play_on(c, pile))
		if (matching.length >= needed) return matching.slice(0, needed)
		return null
	})

	const current_player_name = $derived(() => {
		if (!gs || !room) return ''
		const player = room.players.find(p => p.id === gs.current_player)
		return player?.name ?? gs.current_player.slice(0, 6)
	})

	const opponents = $derived(() => {
		if (!gs) return []
		return gs.player_order
			.filter(id => id !== my_id)
			.map(id => ({
				id,
				name: room?.players.find(p => p.id === id)?.name ?? id.slice(0, 6),
				state: gs.players[id],
			}))
			.filter(o => o.state)
	})

	// Clockwise from south (you): S → W → N → E
	const positioned = $derived.by(() => {
		const opps = opponents()
		if (opps.length === 1) return { north: opps[0], east: null, west: null }
		if (opps.length === 2) return { north: opps[1], west: opps[0], east: null }
		return { north: opps[1], east: opps[2], west: opps[0] }
	})

	function get_player_name(id: string): string {
		return room?.players.find(p => p.id === id)?.name ?? id.slice(0, 6)
	}

	// Rolling action log — keeps last N actions where N = player count
	let action_log = $state<string[]>([])
	let prev_action_id = ''
	$effect(() => {
		if (!gs?.last_action) return
		const raw = `${get_player_name(gs.last_action.player_id)} ${gs.last_action.description}`
		// Deduplicate: build a key from game state that changes each move
		const action_id = `${gs.current_player}:${gs.discard_pile.length}:${gs.deck_count}:${raw}`
		untrack(() => {
			if (action_id === prev_action_id) return
			prev_action_id = action_id
			const max = gs!.player_order.length
			action_log = [...action_log, raw].slice(-max)
		})
	})

	// --- Swap Phase ---
	function handle_swap_card_click(card_id: string, source: 'hand' | 'face_up' | 'face_down') {
		if (source === 'hand') {
			swap_hand_card_id = swap_hand_card_id === card_id ? null : card_id
		} else if (source === 'face_up' && swap_hand_card_id) {
			send_command({
				type: 'SWAP_CARD',
				hand_card_id: swap_hand_card_id,
				face_up_card_id: card_id,
			})
			swap_hand_card_id = null
		}
	}

	const am_ready = $derived(gs ? gs.ready_players.includes(my_id ?? '') : false)
	const ready_count = $derived(gs ? gs.ready_players.length : 0)
	const total_players = $derived(gs ? gs.player_order.length : 0)
	let ready_pending = $state(false)

	async function handle_toggle_ready() {
		if (ready_pending) return
		ready_pending = true
		try {
			await send_command({ type: am_ready ? 'UNREADY' : 'READY' })
		} finally {
			ready_pending = false
		}
	}

	// --- Play Phase ---
	async function handle_play_card_click(card_id: string, source: 'hand' | 'face_up' | 'face_down') {
		if (source === 'face_down') {
			if (!is_my_turn) return
			const index = parseInt(card_id.replace('face_down_', ''), 10)
			if (Number.isNaN(index)) return
			await send_command({ type: 'PLAY_FACE_DOWN', index })
			revealing = true
			setTimeout(() => { revealing = false }, 1000)
			return
		}

		const ids = game_store.selected_card_ids
		if (ids.includes(card_id)) {
			game_store.selected_card_ids = ids.filter(id => id !== card_id)
		} else {
			if (ids.length === 0) {
				game_store.selected_card_ids = [card_id]
			} else {
				const all_cards = [...(gs?.own_state.hand ?? []), ...(gs?.own_state.face_up ?? [])]
				const first_card = all_cards.find(c => c.id === ids[0])
				const new_card = all_cards.find(c => c.id === card_id)
				if (first_card && new_card && first_card.rank === new_card.rank) {
					game_store.selected_card_ids = [...ids, card_id]
				} else {
					game_store.selected_card_ids = [card_id]
				}
			}
		}
	}

	async function handle_play() {
		if (game_store.selected_card_ids.length === 0) return
		await send_command({
			type: 'PLAY_CARD',
			card_ids: game_store.selected_card_ids,
		})
		game_store.selected_card_ids = []
	}

	async function handle_pickup() {
		await send_command({ type: 'PICK_UP_PILE' })
		game_store.selected_card_ids = []
	}

	async function handle_connect_four() {
		if (!four_of_a_kind_cards) return
		await send_command({ type: 'PLAY_CARD', card_ids: four_of_a_kind_cards.map(c => c.id) })
		game_store.selected_card_ids = []
	}

	async function handle_play_lowest() {
		if (!gs || gs.phase !== 'play' || !is_my_turn) return
		const own = gs.own_state
		if (own.hand.length === 0 && own.face_up.length === 0 && own.face_down_count > 0) {
			await send_command({ type: 'PLAY_FACE_DOWN', index: 0 })
			return
		}
		const source = own.hand.length > 0 ? own.hand : own.face_up
		if (source.length === 0) return
		const playable = source.filter(c => can_play_on(c, gs.discard_pile))
		if (playable.length === 0) return
		const special = (c: Card) => DEFAULT_RULESET[c.rank] ? 1 : 0
		playable.sort((a, b) => special(a) - special(b) || RANK_VALUES[a.rank] - RANK_VALUES[b.rank])
		const lowest_rank = playable[0].rank
		const to_play = playable.filter(c => c.rank === lowest_rank)
		await send_command({ type: 'PLAY_CARD', card_ids: to_play.map(c => c.id) })
		game_store.selected_card_ids = []
	}

	function handle_keydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
		if (e.key === 'l') handle_play_lowest()
		if (e.key === 'Enter' && is_my_turn && gs && gs.discard_pile.length > 0) handle_pickup()
	}

	// Discard pile top card + effective top (visible beneath 3s)
	const pile_top = $derived(gs && gs.discard_pile.length > 0 ? gs.discard_pile[gs.discard_pile.length - 1] : null)
	const pile_effective = $derived(gs ? effective_top_card(gs.discard_pile) ?? null : null)
	const show_effective = $derived(pile_top !== null && pile_top.rank === '3' && pile_effective !== null && pile_effective.id !== pile_top.id)
</script>

<svelte:window onkeydown={handle_keydown} />

{#if !in_room}
	<!-- Join / Set Name Form -->
	<div class="flex min-h-screen items-center justify-center bg-gray-100 p-4">
		<div class="w-full max-w-md space-y-6">
			<div class="text-center">
				<h1 class="text-4xl font-bold text-gray-900">Shithead</h1>
				<p class="mt-1 text-sm text-gray-500">{in_room_no_name ? 'Set your name to continue' : `Join room ${room_id}`}</p>
			</div>

			{#if join_error}
				<div class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{join_error}</div>
			{/if}

			<div class="rounded-lg bg-white p-4 shadow-sm space-y-3">
				<label for="name" class="block text-sm font-medium text-gray-700">Your Name</label>
				<input
					id="name"
					type="text"
					bind:value={name_input}
					placeholder="Enter your name"
					maxlength={20}
					class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
					onkeydown={(e) => { if (e.key === 'Enter') handle_join() }}
				/>
				<button
					onclick={handle_join}
					disabled={!connection_store.connected || !name_input.trim() || join_loading}
					class="w-full rounded bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{join_loading ? 'Joining...' : in_room_no_name ? 'Continue' : 'Join Game'}
				</button>
			</div>
		</div>
	</div>
{:else}
	<div class="flex min-h-screen flex-col bg-green-900 text-white">
		{#if !room}
			<!-- Redirecting -->
			<div class="flex flex-1 items-center justify-center">
				<p class="text-gray-300">Returning to lobby...</p>
			</div>
		{:else if room.status === 'waiting'}
			<!-- Waiting Room -->
			<div class="flex flex-1 flex-col items-center justify-center gap-6 p-4">
				<h1 class="text-2xl font-bold">Waiting Room</h1>
				<div class="rounded-lg bg-green-800 p-4">
					<p class="mb-2 text-sm text-green-300">Share this link:</p>
					<div class="flex items-center gap-2">
						<p class="font-mono text-lg font-bold select-all">{room.room_id}</p>
						<button
							onclick={copy_room_link}
							class="rounded bg-green-700 px-2 py-1 text-xs font-medium hover:bg-green-600 transition-colors"
						>
							{copied ? 'Copied!' : 'Copy Link'}
						</button>
					</div>
				</div>

				<div class="w-full max-w-sm">
					<h2 class="mb-2 text-sm font-medium text-green-300">Players ({room.players.length})</h2>
					<div class="space-y-1">
						{#each room.players as player (player.id)}
							<div class="flex items-center gap-2 rounded bg-green-800 px-3 py-2">
								<div class="h-2 w-2 rounded-full {player.connected ? 'bg-green-400' : 'bg-red-400'}"></div>
								<span class="text-sm">{player.name}</span>
								{#if player.id === my_id}
									<span class="text-xs text-green-400">(you)</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<div class="flex gap-3">
					<button
						onclick={start_game}
						disabled={room.players.length < 2}
						class="rounded bg-blue-600 px-6 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Start Game{room.players.length < 2 ? ' (need 2+)' : ''}
					</button>
					<button
						onclick={handle_leave}
						class="rounded bg-red-700 px-6 py-2 text-sm font-medium hover:bg-red-600"
					>
						Leave
					</button>
				</div>
			</div>
		{:else if game_type === 'gin-rummy' && game_store.game_state}
			<GinRummyGameTable on_leave={handle_leave} />
		{:else if gs}
			<!-- Game Table (CSS Grid) -->
			<div class="game-table bg-green-900">
				<!-- North: primary opponent -->
				<div class="area-north flex justify-center p-2">
					{#if positioned.north}
						<OpponentZone
							player_id={positioned.north.id}
							player_name={positioned.north.name}
							state={positioned.north.state}
							is_current_turn={gs.current_player === positioned.north.id}
							ready={gs.phase === 'swap' && gs.ready_players.includes(positioned.north.id)}
						/>
					{/if}
				</div>

				<!-- West: side opponent (compact) -->
				<div class="area-west flex items-center justify-center p-1">
					{#if positioned.west}
						<OpponentZone
							player_id={positioned.west.id}
							player_name={positioned.west.name}
							state={positioned.west.state}
							is_current_turn={gs.current_player === positioned.west.id}
							ready={gs.phase === 'swap' && gs.ready_players.includes(positioned.west.id)}
							compact
						/>
					{/if}
				</div>

				<!-- Center: Game Status + Pile + Deck + Buttons -->
				<div class="area-center flex flex-col items-center justify-center gap-3">
					{#if gs.phase !== 'finished'}
						<GameStatus
							phase={gs.phase}
							current_player_name={current_player_name()}
							is_my_turn={is_my_turn}
							last_effect={gs.last_effect}
							action_log={action_log}
							error_message={game_store.error_message}
							on_dismiss_error={handle_dismiss_error}
						/>
					{/if}

					<div class="flex items-center gap-6">
						<!-- Deck -->
						<div class="flex flex-col items-center gap-1">
							<span class="text-xs text-green-300">Deck</span>
							{#if gs.deck_count > 0}
								<CardBack />
								<span class="text-xs text-green-400">{gs.deck_count}</span>
							{:else}
								<div class="flex items-center justify-center rounded-lg border-2 border-dashed border-green-700" style="width: var(--card-w); height: var(--card-h)">
									<span class="text-xs text-green-600">Empty</span>
								</div>
							{/if}
						</div>

						<!-- Discard Pile -->
						<div class="flex flex-col items-center gap-1 {gs.last_effect === 'burn' ? 'animate-burn' : ''}">
							<span class="text-xs text-green-300">Pile</span>
							{#if pile_top}
								<div class="relative" style="width: {show_effective ? 'calc(var(--card-w) * 1.6)' : 'var(--card-w)'}; height: var(--card-h)">
									{#if show_effective && pile_effective}
										<div class="absolute left-0 top-0">
											<CardComponent card={pile_effective} on_pile />
										</div>
									{/if}
									{#key pile_top.id}
										<div class="absolute top-0 {show_effective ? 'right-0 rotate-6' : 'left-0'}" in:fly={{ y: -20, duration: 200 }}>
											<CardComponent card={pile_top} on_pile />
										</div>
									{/key}
								</div>
								<span class="text-xs text-green-400">{gs.discard_pile.length}</span>
							{:else}
								<div class="flex items-center justify-center rounded-lg border-2 border-dashed border-green-700" style="width: var(--card-w); height: var(--card-h)">
									<span class="text-xs text-green-600">Empty</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- Reveal Overlay -->
					{#if revealing && gs.last_revealed_card}
						<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
							<div class="animate-reveal-card">
								<CardComponent card={gs.last_revealed_card} />
							</div>
						</div>
					{/if}

				</div>

				<!-- East: side opponent (compact) -->
				<div class="area-east flex items-center justify-center p-1">
					{#if positioned.east}
						<OpponentZone
							player_id={positioned.east.id}
							player_name={positioned.east.name}
							state={positioned.east.state}
							is_current_turn={gs.current_player === positioned.east.id}
							ready={gs.phase === 'swap' && gs.ready_players.includes(positioned.east.id)}
							compact
						/>
					{/if}
				</div>

				<!-- South: Player's cards -->
				<div class="area-south border-t border-green-800 bg-green-950 p-3">
					<PlayerHand
						hand={gs.own_state.hand}
						face_up={gs.own_state.face_up}
						face_down_count={gs.own_state.face_down_count}
						discard_pile={gs.discard_pile}
						selected_card_ids={gs.phase === 'swap' ? (swap_hand_card_id ? [swap_hand_card_id] : []) : game_store.selected_card_ids}
						phase={gs.phase}
						is_current_turn={is_my_turn}
						on_card_click={gs.phase === 'swap' ? handle_swap_card_click : handle_play_card_click}
					/>
				</div>

				<!-- Actions: buttons and instructions below player hand -->
				<div class="area-actions flex flex-col items-center gap-1 bg-green-950 px-3 pb-3">
					{#if gs.phase === 'finished'}
						<div class="flex flex-col items-center gap-3">
							<h1 class="text-2xl font-bold">Game Over!</h1>
							{#if game_store.scores}
								<div class="w-full max-w-xs rounded-lg bg-green-800 p-3">
									<div class="space-y-1">
										{#each Object.entries(game_store.scores).sort((a, b) => b[1] - a[1]) as [player_id, score] (player_id)}
											<div class="flex items-center justify-between rounded bg-green-700 px-3 py-1.5">
												<span class="text-sm">{get_player_name(player_id)}</span>
												<span class="text-sm font-bold {score === 0 ? 'text-red-400' : 'text-green-300'}">
													{score === 0 ? 'Shithead!' : 'Winner'}
												</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}
							{#if action_log.length > 0}
								<div class="flex flex-col items-center">
									{#each action_log.slice(-4) as text, i (text + i)}
										<span class="text-xs italic text-gray-400">{text}</span>
									{/each}
								</div>
							{/if}
							<button
								onclick={handle_leave}
								class="rounded bg-blue-600 px-6 py-2 text-sm font-medium hover:bg-blue-500"
							>
								Back to Lobby
							</button>
						</div>
					{:else if gs.phase === 'swap'}
						<div class="flex gap-2">
							{#if swap_hand_card_id}
								<p class="text-sm text-yellow-300">Now tap a face-up card to swap</p>
							{:else}
								<p class="text-sm text-green-300">Tap a hand card, then a face-up card to swap</p>
							{/if}
						</div>
						<div class="flex flex-col items-center gap-1">
							<button
								onclick={handle_toggle_ready}
								disabled={ready_pending}
								class="rounded px-6 py-2 text-sm font-medium transition-colors disabled:opacity-50
									{am_ready ? 'bg-green-600 hover:bg-green-500 ring-2 ring-green-400' : 'bg-purple-600 hover:bg-purple-500'}"
							>
								{am_ready ? 'Ready!' : 'Ready'}
							</button>
							<span class="text-xs text-green-400">{ready_count}/{total_players} ready</span>
						</div>
					{:else if gs.phase === 'play' && (is_my_turn || can_complete_four_of_a_kind)}
						<div class="flex flex-wrap justify-center gap-2">
							<button
								onclick={handle_play}
								disabled={game_store.selected_card_ids.length === 0}
								class="rounded {can_complete_four_of_a_kind && !is_my_turn ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-blue-600 hover:bg-blue-500'} px-6 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{can_complete_four_of_a_kind && !is_my_turn ? 'Complete Four of a Kind!' : `Play Card${game_store.selected_card_ids.length > 1 ? 's' : ''}`}
							</button>
							{#if is_my_turn && four_of_a_kind_cards}
								<button
									onclick={handle_connect_four}
									class="rounded bg-yellow-600 px-6 py-2 text-sm font-medium hover:bg-yellow-500"
								>
									Connect 4!
								</button>
							{/if}
							{#if is_my_turn && !has_playable_card && gs.discard_pile.length > 0 && (gs.own_state.hand.length > 0 || gs.own_state.face_up.length > 0)}
								<button
									onclick={handle_pickup}
									class="rounded bg-orange-600 px-6 py-2 text-sm font-medium hover:bg-orange-500"
								>
									Pick Up Pile
								</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Game started but no state yet -->
			<div class="flex flex-1 items-center justify-center">
				<p class="text-green-300">Loading game...</p>
			</div>
		{/if}
	</div>
{/if}
