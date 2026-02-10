<script lang="ts">
	import { goto } from '$app/navigation'
	import { connection_store } from '$lib/stores/connection.svelte'
	import { lobby_store } from '$lib/stores/lobby.svelte'
	import { game_store } from '$lib/stores/game.svelte'
	import { connect, leave_room, start_game, send_command } from '$lib/socket'
	import CardComponent from '$lib/components/card.svelte'
	import CardBack from '$lib/components/card_back.svelte'
	import PlayerHand from '$lib/components/player_hand.svelte'
	import OpponentZone from '$lib/components/opponent_zone.svelte'
	import GameStatus from '$lib/components/game_status.svelte'

	// Redirect home if no room
	$effect(() => {
		if (connection_store.connected && !lobby_store.room) {
			goto('/')
		}
	})

	// Connect if not yet
	$effect(() => {
		if (!connection_store.connected) {
			connect()
		}
	})

	const room = $derived(lobby_store.room)
	const gs = $derived(game_store.game_state)
	const my_id = $derived(connection_store.player_id)

	// For swap phase: track which hand card is selected for swapping
	let swap_hand_card_id = $state<string | null>(null)

	const is_my_turn = $derived(gs ? gs.current_player === my_id : false)

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

	function get_player_name(id: string): string {
		return room?.players.find(p => p.id === id)?.name ?? id.slice(0, 6)
	}

	// --- Swap Phase ---
	function handle_swap_card_click(card_id: string, source: 'hand' | 'face_up' | 'face_down') {
		if (source === 'hand') {
			// Select/deselect hand card
			swap_hand_card_id = swap_hand_card_id === card_id ? null : card_id
		} else if (source === 'face_up' && swap_hand_card_id) {
			// Swap hand card with face-up card
			send_command({
				type: 'SWAP_CARD',
				hand_card_id: swap_hand_card_id,
				face_up_card_id: card_id,
			})
			swap_hand_card_id = null
		}
	}

	async function handle_ready() {
		await send_command({ type: 'READY' })
	}

	// --- Play Phase ---
	function handle_play_card_click(card_id: string, source: 'hand' | 'face_up' | 'face_down') {
		if (!is_my_turn) return

		if (source === 'face_down') {
			// Blind play: immediately send
			send_command({ type: 'PLAY_CARD', card_ids: [card_id] })
			return
		}

		// Toggle selection for hand/face_up cards
		const ids = game_store.selected_card_ids
		if (ids.includes(card_id)) {
			game_store.selected_card_ids = ids.filter(id => id !== card_id)
		} else {
			// Allow selecting multiple cards of the same rank
			if (ids.length === 0) {
				game_store.selected_card_ids = [card_id]
			} else {
				// Check if same rank
				const all_cards = [...(gs?.own_state.hand ?? []), ...(gs?.own_state.face_up ?? [])]
				const first_card = all_cards.find(c => c.id === ids[0])
				const new_card = all_cards.find(c => c.id === card_id)
				if (first_card && new_card && first_card.rank === new_card.rank) {
					game_store.selected_card_ids = [...ids, card_id]
				} else {
					// Different rank: replace selection
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

	async function handle_leave() {
		try {
			await leave_room()
		} catch {
			// ignore
		}
		goto('/')
	}

	// Discard pile top card
	const pile_top = $derived(gs && gs.discard_pile.length > 0 ? gs.discard_pile[gs.discard_pile.length - 1] : null)
</script>

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
				<p class="mb-2 text-sm text-green-300">Room Code:</p>
				<p class="font-mono text-lg font-bold select-all">{room.room_id}</p>
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
	{:else if gs && gs.phase !== 'finished'}
		<!-- Game Table -->
		<div class="flex flex-1 flex-col">
			<!-- Top: Opponents -->
			<div class="flex flex-wrap justify-center gap-2 p-2">
				{#each opponents() as opp (opp.id)}
					<OpponentZone
						player_id={opp.id}
						player_name={opp.name}
						state={opp.state}
						is_current_turn={gs.current_player === opp.id}
					/>
				{/each}
			</div>

			<!-- Center: Game Status + Pile + Deck -->
			<div class="flex flex-1 flex-col items-center justify-center gap-3">
				<GameStatus
					phase={gs.phase}
					current_player_name={current_player_name()}
					is_my_turn={is_my_turn}
					last_effect={gs.last_effect}
					error_message={game_store.error_message}
				/>

				<div class="flex items-center gap-6">
					<!-- Deck -->
					<div class="flex flex-col items-center gap-1">
						<span class="text-xs text-green-300">Deck</span>
						{#if gs.deck_count > 0}
							<CardBack />
							<span class="text-xs text-green-400">{gs.deck_count}</span>
						{:else}
							<div class="flex h-20 w-14 items-center justify-center rounded-lg border-2 border-dashed border-green-700">
								<span class="text-xs text-green-600">Empty</span>
							</div>
						{/if}
					</div>

					<!-- Discard Pile -->
					<div class="flex flex-col items-center gap-1">
						<span class="text-xs text-green-300">Pile</span>
						{#if pile_top}
							<CardComponent card={pile_top} />
							<span class="text-xs text-green-400">{gs.discard_pile.length}</span>
						{:else}
							<div class="flex h-20 w-14 items-center justify-center rounded-lg border-2 border-dashed border-green-700">
								<span class="text-xs text-green-600">Empty</span>
							</div>
						{/if}
					</div>
				</div>

				<!-- Action Buttons -->
				{#if gs.phase === 'swap'}
					<div class="flex gap-2">
						{#if swap_hand_card_id}
							<p class="text-sm text-yellow-300">Now tap a face-up card to swap</p>
						{:else}
							<p class="text-sm text-green-300">Tap a hand card, then a face-up card to swap</p>
						{/if}
					</div>
					<button
						onclick={handle_ready}
						class="rounded bg-purple-600 px-6 py-2 text-sm font-medium hover:bg-purple-500"
					>
						Ready
					</button>
				{:else if gs.phase === 'play' && is_my_turn}
					<div class="flex gap-2">
						<button
							onclick={handle_play}
							disabled={game_store.selected_card_ids.length === 0}
							class="rounded bg-blue-600 px-6 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Play Card{game_store.selected_card_ids.length > 1 ? 's' : ''}
						</button>
						<button
							onclick={handle_pickup}
							class="rounded bg-orange-600 px-6 py-2 text-sm font-medium hover:bg-orange-500"
						>
							Pick Up Pile
						</button>
					</div>
				{/if}
			</div>

			<!-- Bottom: Player's cards -->
			<div class="border-t border-green-800 bg-green-950 p-3">
				<PlayerHand
					hand={gs.own_state.hand}
					face_up={gs.own_state.face_up}
					face_down_count={gs.own_state.face_down_count}
					selected_card_ids={gs.phase === 'swap' ? (swap_hand_card_id ? [swap_hand_card_id] : []) : game_store.selected_card_ids}
					phase={gs.phase}
					is_current_turn={is_my_turn}
					on_card_click={gs.phase === 'swap' ? handle_swap_card_click : handle_play_card_click}
				/>
			</div>
		</div>
	{:else if gs && gs.phase === 'finished'}
		<!-- Game Over -->
		<div class="flex flex-1 flex-col items-center justify-center gap-6 p-4">
			<h1 class="text-3xl font-bold">Game Over!</h1>

			{#if game_store.scores}
				<div class="w-full max-w-sm rounded-lg bg-green-800 p-4">
					<h2 class="mb-3 text-center text-sm font-medium text-green-300">Scores</h2>
					<div class="space-y-2">
						{#each Object.entries(game_store.scores).sort((a, b) => b[1] - a[1]) as [player_id, score] (player_id)}
							<div class="flex items-center justify-between rounded bg-green-700 px-3 py-2">
								<span class="text-sm">{get_player_name(player_id)}</span>
								<span class="text-sm font-bold {score === 0 ? 'text-red-400' : 'text-green-300'}">
									{score === 0 ? 'Shithead!' : score}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<button
				onclick={handle_leave}
				class="rounded bg-blue-600 px-6 py-2 text-sm font-medium hover:bg-blue-500"
			>
				Back to Lobby
			</button>
		</div>
	{:else}
		<!-- Game started but no state yet -->
		<div class="flex flex-1 items-center justify-center">
			<p class="text-green-300">Loading game...</p>
		</div>
	{/if}
</div>
