<script lang="ts">
	import type { Card } from '@shead/shared'
	import CardComponent from '../card.svelte'
	import CardBack from '../card_back.svelte'

	interface Replay_gin_rummy_state {
		discard_pile: Card[]
		stock_count: number
		players: Record<string, { hand: Card[] }>
		current_player: string
		phase: string
		player_order: [string, string]
		scores: Record<string, number>
		round_number: number
		knocker_id: string | null
		knocker_melds: Card[][] | null
		knocker_deadwood: Card[] | null
	}

	interface Props {
		state: unknown
		player_names: Record<string, string>
	}

	let { state, player_names }: Props = $props()

	const s = $derived(state as Replay_gin_rummy_state)
	const discard_top = $derived(s.discard_pile.length > 0 ? s.discard_pile[s.discard_pile.length - 1] : null)

	function name(id: string): string {
		return player_names[id] ?? id.slice(0, 6)
	}
</script>

{#if s}
	<div class="flex flex-col items-center gap-3 w-full max-w-lg">
		<!-- Status -->
		<div class="text-center text-sm">
			<span class="text-green-300">Round {s.round_number}</span>
			<span class="mx-2 text-green-700">|</span>
			{#if s.phase === 'finished'}
				<span class="text-gray-300">Game Over</span>
			{:else}
				<span class="text-yellow-300">{name(s.current_player)}'s turn</span>
				<span class="text-xs text-green-500 ml-1">({s.phase})</span>
			{/if}
		</div>

		<!-- Scores -->
		<div class="flex gap-4 text-xs">
			{#each s.player_order as pid (pid)}
				<span class="text-green-300">{name(pid)}: <span class="font-bold">{s.scores[pid] ?? 0}</span></span>
			{/each}
		</div>

		<!-- Stock + Discard -->
		<div class="flex items-center gap-4">
			<div class="flex flex-col items-center gap-0.5">
				<span class="text-xs text-green-400">Stock</span>
				{#if s.stock_count > 0}
					<CardBack small />
					<span class="text-xs text-green-500">{s.stock_count}</span>
				{:else}
					<div class="flex items-center justify-center rounded border border-dashed border-green-700" style="width: var(--card-w-sm); height: var(--card-h-sm)">
						<span class="text-[8px] text-green-700">Empty</span>
					</div>
				{/if}
			</div>
			<div class="flex flex-col items-center gap-0.5">
				<span class="text-xs text-green-400">Discard</span>
				{#if discard_top}
					<CardComponent card={discard_top} small />
					<span class="text-xs text-green-500">{s.discard_pile.length}</span>
				{:else}
					<div class="flex items-center justify-center rounded border border-dashed border-green-700" style="width: var(--card-w-sm); height: var(--card-h-sm)">
						<span class="text-[8px] text-green-700">Empty</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Players' hands -->
		{#each s.player_order as pid (pid)}
			{@const ps = s.players[pid]}
			{#if ps}
				<div class="w-full rounded-lg bg-green-800 p-2 {s.current_player === pid ? 'ring-2 ring-yellow-400' : ''}">
					<p class="text-xs font-bold mb-1 {s.current_player === pid ? 'text-yellow-300' : 'text-green-300'}">
						{name(pid)} ({ps.hand.length} cards)
					</p>
					<div class="flex flex-wrap gap-0.5">
						{#each ps.hand as card (card.id)}
							<CardComponent {card} small />
						{/each}
					</div>
				</div>
			{/if}
		{/each}

		<!-- Knocker melds if applicable -->
		{#if s.knocker_melds && s.knocker_id}
			<div class="flex flex-col items-center gap-1">
				<span class="text-xs text-green-400">{name(s.knocker_id)}'s melds:</span>
				<div class="flex flex-wrap justify-center gap-2">
					{#each s.knocker_melds as meld, i (i)}
						<div class="flex gap-0.5 rounded border border-green-600 p-1">
							{#each meld as card (card.id)}
								<CardComponent {card} small />
							{/each}
						</div>
					{/each}
				</div>
				{#if s.knocker_deadwood && s.knocker_deadwood.length > 0}
					<div class="flex items-center gap-1">
						<span class="text-xs text-red-300">Deadwood:</span>
						{#each s.knocker_deadwood as card (card.id)}
							<CardComponent {card} small />
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
