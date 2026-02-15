<script lang="ts">
	import { connection_store } from '$lib/stores/connection.svelte'
	import { lobby_store } from '$lib/stores/lobby.svelte'
	import { game_store } from '$lib/stores/game.svelte'
	import type { Visible_gin_rummy_state } from '$lib/stores/gin_rummy.svelte'
	import type { Card, Suit } from '@shead/shared'
	import { GIN_RANK_ORDER } from '@shead/shared'
	import { send_command } from '$lib/socket.svelte'
	import CardComponent from '$lib/components/card.svelte'
	import CardBack from '$lib/components/card_back.svelte'

	interface Props {
		on_leave: () => void
	}

	let { on_leave }: Props = $props()

	const gs = $derived(game_store.game_state as Visible_gin_rummy_state)
	const my_id = $derived(connection_store.player_id)
	const room = $derived(lobby_store.room)
	const is_my_turn = $derived(gs?.current_player === my_id)

	let selected_ids = $state<string[]>([])
	let meld_groups = $state<string[][]>([])
	let arranging_melds = $state(false)

	function get_player_name(id: string): string {
		return room?.players.find(p => p.id === id)?.name ?? id.slice(0, 6)
	}

	function handle_card_click(card_id: string) {
		if (arranging_melds) {
			// In meld arrangement mode, toggle selection
			if (selected_ids.includes(card_id)) {
				selected_ids = selected_ids.filter(id => id !== card_id)
			} else {
				selected_ids = [...selected_ids, card_id]
			}
			return
		}

		// Normal selection toggle
		if (selected_ids.includes(card_id)) {
			selected_ids = selected_ids.filter(id => id !== card_id)
		} else {
			selected_ids = [...selected_ids, card_id]
		}
	}

	async function handle_draw_stock() {
		await send_command({ type: 'DRAW_STOCK' })
		selected_ids = []
	}

	async function handle_draw_discard() {
		await send_command({ type: 'DRAW_DISCARD' })
		selected_ids = []
	}

	async function handle_pass_first_draw() {
		await send_command({ type: 'PASS_FIRST_DRAW' })
	}

	async function handle_discard() {
		if (selected_ids.length !== 1) return
		await send_command({ type: 'DISCARD', card_id: selected_ids[0] })
		selected_ids = []
	}

	function start_knock_arrangement() {
		arranging_melds = true
		meld_groups = []
		selected_ids = []
	}

	function add_meld_group() {
		if (selected_ids.length < 3) return
		meld_groups = [...meld_groups, [...selected_ids]]
		selected_ids = []
	}

	function cancel_arrangement() {
		arranging_melds = false
		meld_groups = []
		selected_ids = []
	}

	async function submit_knock() {
		// Any remaining selected cards go as a final meld if 3+
		let final_melds = [...meld_groups]
		if (selected_ids.length >= 3) {
			final_melds = [...final_melds, [...selected_ids]]
		}
		await send_command({ type: 'KNOCK', melds: final_melds })
		arranging_melds = false
		meld_groups = []
		selected_ids = []
	}

	async function submit_gin() {
		let final_melds = [...meld_groups]
		if (selected_ids.length >= 3) {
			final_melds = [...final_melds, [...selected_ids]]
		}
		await send_command({ type: 'GIN', melds: final_melds })
		arranging_melds = false
		meld_groups = []
		selected_ids = []
	}

	async function handle_lay_off(meld_index: number) {
		if (selected_ids.length === 0) return
		await send_command({ type: 'LAY_OFF', card_ids: selected_ids, meld_index })
		selected_ids = []
	}

	async function handle_accept_knock() {
		await send_command({ type: 'ACCEPT_KNOCK' })
	}

	async function handle_next_round() {
		await send_command({ type: 'NEXT_ROUND' })
		selected_ids = []
	}

	// Cards already used in arranged meld groups
	const used_in_melds = $derived(new Set(meld_groups.flat()))

	// Is the card the one just drawn from discard (can't re-discard it)?
	function is_no_discard(card_id: string): boolean {
		return gs?.last_drawn_from_discard_id === card_id
	}

	const latest_round = $derived(gs?.round_history.length > 0 ? gs.round_history[gs.round_history.length - 1] : null)

	const SUIT_SYMBOLS: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }
	const SUIT_COLORS: Record<Suit, string> = { hearts: 'text-red-400', diamonds: 'text-red-400', clubs: 'text-white', spades: 'text-white' }

	const drawn_card = $derived(
		gs?.last_drawn_card_id
			? gs.own_hand.find(c => c.id === gs.last_drawn_card_id) ?? null
			: null
	)

	const SUIT_ORDER: Record<Suit, number> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }
	const sorted_hand = $derived(
		gs?.own_hand
			? [...gs.own_hand].sort((a, b) => {
					const suit_diff = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]
					if (suit_diff !== 0) return suit_diff
					return GIN_RANK_ORDER[a.rank] - GIN_RANK_ORDER[b.rank]
				})
			: []
	)
</script>

{#if gs}
	<div class="flex min-h-screen flex-col bg-green-900 text-white">
		<!-- Top bar: scores -->
		<div class="flex items-center justify-between border-b border-green-800 bg-green-950 px-4 py-2">
			<div class="text-sm">
				<span class="text-green-300">Round {gs.round_number}</span>
				<span class="mx-2 text-green-700">|</span>
				<span class="text-green-300">Target: {gs.target_score}</span>
			</div>
			<div class="flex gap-4 text-sm">
				{#each gs.player_order as pid (pid)}
					<span class="{pid === my_id ? 'text-blue-300' : 'text-gray-300'}">
						{get_player_name(pid)}: <span class="font-bold">{gs.scores[pid] ?? 0}</span>
					</span>
				{/each}
			</div>
		</div>

		<!-- Opponent area -->
		<div class="flex flex-col items-center gap-1 p-3">
			<span class="text-sm {gs.current_player === gs.opponent_id ? 'text-yellow-300 font-bold' : 'text-green-300'}">
				{get_player_name(gs.opponent_id)}
			</span>
			<div class="flex gap-0.5">
				{#if gs.opponent_hand}
					<!-- Show opponent hand during knock resolution -->
					{#each gs.opponent_hand as card (card.id)}
						<CardComponent {card} small />
					{/each}
				{:else}
					{#each Array(gs.opponent.hand_count) as _, i (i)}
						<CardBack small />
					{/each}
				{/if}
			</div>
		</div>

		<!-- Center: Stock + Discard + Status -->
		<div class="flex flex-1 flex-col items-center justify-center gap-4">
			<!-- Status message -->
			<div class="text-center text-sm">
				{#if gs.phase === 'first_draw'}
					{#if is_my_turn}
						<span class="text-yellow-300">Take the discard or pass</span>
					{:else}
						<span class="text-green-300">Waiting for {get_player_name(gs.current_player)}...</span>
					{/if}
				{:else if gs.phase === 'draw'}
					{#if is_my_turn}
						<span class="text-yellow-300">Draw a card</span>
					{:else}
						<span class="text-green-300">Waiting for {get_player_name(gs.current_player)}...</span>
					{/if}
				{:else if gs.phase === 'discard'}
					{#if is_my_turn}
						{#if arranging_melds}
							<span class="text-yellow-300">Select cards for each meld, then confirm</span>
						{:else if gs.can_gin}
							<span class="text-yellow-300">Discard or go Gin!</span>
						{:else if gs.can_knock}
							<span class="text-yellow-300">Discard or Knock (deadwood {gs.own_deadwood_points})</span>
						{:else}
							<span class="text-yellow-300">Discard a card</span>
						{/if}
					{:else}
						<span class="text-green-300">Waiting for {get_player_name(gs.current_player)}...</span>
					{/if}
				{:else if gs.phase === 'knock_response'}
					{#if is_my_turn}
						<span class="text-yellow-300">Lay off cards or accept the knock</span>
					{:else}
						<span class="text-green-300">Waiting for {get_player_name(gs.current_player)}...</span>
					{/if}
				{:else if gs.phase === 'round_over'}
					{#if latest_round}
						{#if latest_round.winner === null}
							<span class="text-gray-300">Round draw — stock exhausted</span>
						{:else if latest_round.was_gin}
							<span class="text-yellow-300">{get_player_name(latest_round.winner)} went Gin! (+{latest_round.points_awarded})</span>
						{:else if latest_round.was_undercut}
							<span class="text-red-300">{get_player_name(latest_round.winner)} undercut! (+{latest_round.points_awarded})</span>
						{:else}
							<span class="text-green-300">{get_player_name(latest_round.winner)} wins the round (+{latest_round.points_awarded})</span>
						{/if}
					{/if}
				{:else if gs.phase === 'finished'}
					<span class="text-2xl font-bold">Game Over!</span>
				{/if}
			</div>

			{#if game_store.error_message}
				<div class="rounded border border-red-500 bg-red-900/50 px-3 py-1.5 text-sm text-red-300">
					{game_store.error_message}
					<button onclick={() => game_store.error_message = null} class="ml-2 text-red-400 hover:text-red-200">x</button>
				</div>
			{/if}

			<!-- Stock and Discard -->
			<div class="flex items-center gap-8">
				<!-- Stock pile -->
				<div class="flex flex-col items-center gap-1">
					<span class="text-xs text-green-300">Stock</span>
					{#if gs.stock_count > 0}
						<CardBack onclick={is_my_turn && gs.phase === 'draw' ? handle_draw_stock : undefined} />
						<span class="text-xs text-green-400">{gs.stock_count}</span>
					{:else}
						<div class="flex items-center justify-center rounded-lg border-2 border-dashed border-green-700" style="width: var(--card-w); height: var(--card-h)">
							<span class="text-xs text-green-600">Empty</span>
						</div>
					{/if}
				</div>

				<!-- Discard pile -->
				<div class="flex flex-col items-center gap-1">
					<span class="text-xs text-green-300">Discard</span>
					{#if gs.discard_top}
						<CardComponent
							card={gs.discard_top}
							onclick={is_my_turn && (gs.phase === 'draw' || gs.phase === 'first_draw') ? handle_draw_discard : undefined}
						/>
					{:else}
						<div class="flex items-center justify-center rounded-lg border-2 border-dashed border-green-700" style="width: var(--card-w); height: var(--card-h)">
							<span class="text-xs text-green-600">Empty</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Knocker's melds display (during knock_response / round_over) -->
			{#if gs.knocker_melds && (gs.phase === 'knock_response' || gs.phase === 'round_over')}
				<div class="flex flex-col items-center gap-2">
					<span class="text-xs text-green-300">{get_player_name(gs.knocker_id ?? '')}'s melds:</span>
					<div class="flex flex-wrap justify-center gap-3">
						{#each gs.knocker_melds as meld, i (i)}
							<button
								class="flex gap-0.5 rounded-lg border border-green-600 p-1 {gs.phase === 'knock_response' && is_my_turn && selected_ids.length > 0 ? 'hover:border-yellow-400 cursor-pointer' : 'cursor-default'}"
								onclick={() => { if (gs.phase === 'knock_response' && is_my_turn) handle_lay_off(i) }}
								type="button"
							>
								{#each meld as card (card.id)}
									<CardComponent {card} small />
								{/each}
							</button>
						{/each}
					</div>
					{#if gs.knocker_deadwood && gs.knocker_deadwood.length > 0}
						<div class="flex items-center gap-1">
							<span class="text-xs text-red-300">Deadwood:</span>
							{#each gs.knocker_deadwood as card (card.id)}
								<CardComponent {card} small />
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Player's hand -->
		<div class="border-t border-green-800 bg-green-950 p-3">
			<div class="mb-1 flex items-center justify-center gap-3 text-xs">
				{#if drawn_card}
					<span class="text-green-400">
						Drew: <span class="font-bold {SUIT_COLORS[drawn_card.suit]}">{drawn_card.rank}{SUIT_SYMBOLS[drawn_card.suit]}</span>
					</span>
				{/if}
				{#if gs.phase === 'discard' || gs.phase === 'draw' || gs.phase === 'first_draw'}
					<span class="text-green-400">
						Deadwood: <span class="font-bold {gs.own_deadwood_points <= 10 ? 'text-green-300' : 'text-red-300'}">{gs.own_deadwood_points}</span>
					</span>
				{/if}
			</div>
			<div class="flex flex-wrap justify-center gap-1">
				{#each sorted_hand as card (card.id)}
					{@const in_meld = used_in_melds.has(card.id)}
					<div class="{in_meld ? 'opacity-30' : ''}">
						<CardComponent
							{card}
							selected={selected_ids.includes(card.id)}
							disabled={in_meld}
							onclick={() => { if (!in_meld) handle_card_click(card.id) }}
						/>
					</div>
				{/each}
			</div>

			<!-- Arranged meld groups preview -->
			{#if arranging_melds && meld_groups.length > 0}
				<div class="mt-2 flex flex-wrap justify-center gap-2">
					{#each meld_groups as group, i (i)}
						<div class="flex gap-0.5 rounded border border-green-600 p-1">
							{#each group as card_id (card_id)}
								{@const card = gs.own_hand.find(c => c.id === card_id)}
								{#if card}
									<CardComponent {card} small />
								{/if}
							{/each}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Action buttons -->
		<div class="flex flex-col items-center gap-2 bg-green-950 px-3 pb-3">
			{#if gs.phase === 'first_draw' && is_my_turn}
				<div class="flex gap-2">
					<button
						onclick={handle_draw_discard}
						class="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
					>
						Take Discard
					</button>
					<button
						onclick={handle_pass_first_draw}
						class="rounded bg-gray-600 px-4 py-2 text-sm font-medium hover:bg-gray-500"
					>
						Pass
					</button>
				</div>
			{:else if gs.phase === 'draw' && is_my_turn}
				<div class="flex gap-2">
					<button
						onclick={handle_draw_stock}
						class="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
					>
						Draw from Stock
					</button>
					{#if gs.discard_top}
						<button
							onclick={handle_draw_discard}
							class="rounded bg-purple-600 px-4 py-2 text-sm font-medium hover:bg-purple-500"
						>
							Take Discard
						</button>
					{/if}
				</div>
			{:else if gs.phase === 'discard' && is_my_turn}
				{#if arranging_melds}
					<div class="flex flex-wrap justify-center gap-2">
						<button
							onclick={add_meld_group}
							disabled={selected_ids.length < 3}
							class="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Add Meld ({selected_ids.length} selected)
						</button>
						{#if gs.can_knock}
							<button
								onclick={submit_knock}
								class="rounded bg-orange-600 px-4 py-2 text-sm font-medium hover:bg-orange-500"
							>
								Knock
							</button>
						{/if}
						{#if gs.can_gin}
							<button
								onclick={submit_gin}
								class="rounded bg-yellow-600 px-4 py-2 text-sm font-medium hover:bg-yellow-500"
							>
								Gin
							</button>
						{/if}
						<button
							onclick={cancel_arrangement}
							class="rounded bg-gray-600 px-4 py-2 text-sm font-medium hover:bg-gray-500"
						>
							Cancel
						</button>
					</div>
				{:else}
					<div class="flex flex-wrap justify-center gap-2">
						<button
							onclick={handle_discard}
							disabled={selected_ids.length !== 1 || is_no_discard(selected_ids[0])}
							class="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Discard{selected_ids.length === 1 ? '' : ' (select 1)'}
						</button>
						{#if gs.can_knock || gs.can_gin}
							<button
								onclick={start_knock_arrangement}
								class="rounded bg-orange-600 px-4 py-2 text-sm font-medium hover:bg-orange-500"
							>
								{gs.can_gin ? 'Gin' : 'Knock'}
							</button>
						{/if}
					</div>
				{/if}
			{:else if gs.phase === 'knock_response' && is_my_turn}
				<div class="flex gap-2">
					{#if selected_ids.length > 0}
						<span class="text-xs text-green-300 self-center">Select a meld above to lay off</span>
					{/if}
					<button
						onclick={handle_accept_knock}
						class="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
					>
						Accept Knock
					</button>
				</div>
			{:else if gs.phase === 'round_over'}
				<button
					onclick={handle_next_round}
					class="rounded bg-blue-600 px-6 py-2 text-sm font-medium hover:bg-blue-500"
				>
					Next Round
				</button>
			{:else if gs.phase === 'finished'}
				<div class="flex flex-col items-center gap-3">
					{#each gs.player_order as pid (pid)}
						<div class="flex items-center gap-2">
							<span class="text-sm">{get_player_name(pid)}</span>
							<span class="font-bold {(gs.scores[pid] ?? 0) >= gs.target_score ? 'text-yellow-300' : 'text-gray-300'}">{gs.scores[pid] ?? 0}</span>
							{#if (gs.scores[pid] ?? 0) >= gs.target_score}
								<span class="text-yellow-300 text-xs">Winner!</span>
							{/if}
						</div>
					{/each}

					<!-- Round history -->
					{#if gs.round_history.length > 0}
						<div class="w-full max-w-xs">
							<p class="text-xs text-green-400 mb-1">Round History:</p>
							<div class="space-y-0.5 max-h-32 overflow-y-auto">
								{#each gs.round_history as round (round.round_number)}
									<div class="text-xs text-gray-400">
										R{round.round_number}:
										{#if round.winner === null}
											Draw
										{:else}
											{get_player_name(round.winner)} +{round.points_awarded}
											{round.was_gin ? '(Gin)' : round.was_undercut ? '(Undercut)' : ''}
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<button
						onclick={on_leave}
						class="rounded bg-blue-600 px-6 py-2 text-sm font-medium hover:bg-blue-500"
					>
						Back to Lobby
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
