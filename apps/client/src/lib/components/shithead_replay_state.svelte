<script lang="ts">
	import type { Card } from '@shead/shared'
	import { Direction } from '@shead/shared'
	import CardComponent from './card.svelte'
	import CardBack from './card_back.svelte'

	interface Replay_shithead_state {
		discard_pile: Card[]
		deck_count: number
		players: Record<string, { hand: Card[]; face_up: Card[]; face_down: Card[] }>
		current_player: string
		phase: 'swap' | 'play' | 'finished'
		player_order: string[]
		direction: number
		last_effect: 'burn' | 'reverse' | 'skip' | null
		last_action: { player_id: string; description: string } | null
	}

	interface Props {
		state: unknown
		player_names: Record<string, string>
		player_order: string[]
	}

	let { state, player_names, player_order }: Props = $props()

	const s = $derived(state as Replay_shithead_state)
	const pile_top = $derived(s.discard_pile.length > 0 ? s.discard_pile[s.discard_pile.length - 1] : null)

	function name(id: string): string {
		return player_names[id] ?? id.slice(0, 6)
	}
</script>

{#if s}
	<div class="flex flex-col items-center gap-3 w-full max-w-lg">
		<!-- Status line -->
		<div class="text-center text-sm">
			{#if s.phase === 'finished'}
				<span class="text-gray-300">Game Over</span>
			{:else if s.phase === 'swap'}
				<span class="text-green-300">Swap Phase</span>
			{:else}
				<span class="text-yellow-300">{name(s.current_player)}'s turn</span>
				{#if s.direction === Direction.COUNTER_CLOCKWISE}
					<span class="text-xs text-green-500 ml-1">(reversed)</span>
				{/if}
			{/if}
			{#if s.last_action}
				<p class="text-xs italic text-gray-400 mt-0.5">{name(s.last_action.player_id)} {s.last_action.description}</p>
			{/if}
			{#if s.last_effect}
				<span class="text-xs text-orange-300 ml-1">[{s.last_effect}]</span>
			{/if}
		</div>

		<!-- Center: pile + deck -->
		<div class="flex items-center gap-4">
			<div class="flex flex-col items-center gap-0.5">
				<span class="text-xs text-green-400">Deck</span>
				{#if s.deck_count > 0}
					<CardBack small />
					<span class="text-xs text-green-500">{s.deck_count}</span>
				{:else}
					<div class="flex items-center justify-center rounded border border-dashed border-green-700" style="width: var(--card-w-sm); height: var(--card-h-sm)">
						<span class="text-[8px] text-green-700">Empty</span>
					</div>
				{/if}
			</div>
			<div class="flex flex-col items-center gap-0.5">
				<span class="text-xs text-green-400">Pile</span>
				{#if pile_top}
					<CardComponent card={pile_top} small />
					<span class="text-xs text-green-500">{s.discard_pile.length}</span>
				{:else}
					<div class="flex items-center justify-center rounded border border-dashed border-green-700" style="width: var(--card-w-sm); height: var(--card-h-sm)">
						<span class="text-[8px] text-green-700">Empty</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- All players (stable order from initial state) -->
		{#each player_order as pid (pid)}
			{@const ps = s.players[pid]}
			{@const is_out = !s.player_order.includes(pid)}
			<div class="w-full rounded-lg p-2 {is_out ? 'bg-green-800/50' : 'bg-green-800'} {s.current_player === pid && s.phase === 'play' && !is_out ? 'ring-2 ring-yellow-400' : ''}">
				<p class="text-xs font-bold mb-1 {is_out ? 'text-gray-400' : s.current_player === pid ? 'text-yellow-300' : 'text-green-300'}">
					{name(pid)}{#if is_out} <span class="italic font-normal">- out</span>{/if}
				</p>
				{#if ps && !is_out}
					{#if ps.hand.length > 0}
						<div class="mb-1">
							<span class="text-[10px] text-green-500">Hand:</span>
							<div class="flex flex-wrap gap-0.5 mt-0.5">
								{#each ps.hand as card (card.id)}
									<CardComponent {card} small />
								{/each}
							</div>
						</div>
					{/if}
					{#if ps.face_up.length > 0}
						<div class="mb-1">
							<span class="text-[10px] text-green-500">Face up:</span>
							<div class="flex flex-wrap gap-0.5 mt-0.5">
								{#each ps.face_up as card (card.id)}
									<CardComponent {card} small />
								{/each}
							</div>
						</div>
					{/if}
					{#if ps.face_down.length > 0}
						<div>
							<span class="text-[10px] text-green-500">Face down:</span>
							<div class="flex flex-wrap gap-0.5 mt-0.5">
								{#each ps.face_down as card (card.id)}
									<CardComponent {card} small />
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
{/if}
