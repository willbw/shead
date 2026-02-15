<script lang="ts">
	import type { Visible_player_state } from '$lib/stores/game.svelte'
	import CardComponent from './card.svelte'
	import CardBack from './card_back.svelte'

	interface Props {
		player_id: string
		player_name: string
		state: Visible_player_state
		is_current_turn: boolean
		ready?: boolean
		compact?: boolean
	}

	let { player_name, state, is_current_turn, ready = false, compact = false }: Props = $props()
</script>

<div class="flex {compact ? 'flex-col items-center gap-0.5 p-1' : 'flex-col items-center gap-1 p-2'} rounded-lg border transition-colors duration-300 {is_current_turn ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-gray-50'}">
	<div class="flex items-center gap-1">
		<span class="{compact ? 'text-xs' : 'text-sm'} font-medium {is_current_turn ? 'text-yellow-700' : 'text-gray-600'}">
			{player_name}
		</span>
		{#if is_current_turn}
			<span class="text-xs text-yellow-600">{compact ? '...' : '(playing)'}</span>
		{/if}
		{#if ready}
			<span class="text-xs text-green-600">(ready)</span>
		{/if}
	</div>

	<!-- Hand count -->
	{#if state.hand_count > 0}
		<div class="flex items-center gap-0.5">
			{#if !compact}<span class="text-xs text-gray-400">Hand:</span>{/if}
			<div class="flex -space-x-2 md:-space-x-3">
				{#each { length: Math.min(state.hand_count, compact ? 3 : 6) } as _, i (i)}
					<CardBack />
				{/each}
			</div>
			{#if state.hand_count > (compact ? 3 : 6)}
				<span class="text-xs text-gray-400">+{state.hand_count - (compact ? 3 : 6)}</span>
			{/if}
		</div>
	{/if}

	<!-- Face-up cards -->
	{#if state.face_up.length > 0}
		<div class="flex gap-0.5">
			{#each state.face_up as card (card.id)}
				<CardComponent {card} />
			{/each}
		</div>
	{/if}

	<!-- Face-down: always visible, small until they're the active source -->
	{#if state.face_down_count > 0}
		<div class="flex gap-0.5">
			{#each { length: state.face_down_count } as _, i (i)}
				<CardBack small={state.hand_count > 0 || state.face_up.length > 0} />
			{/each}
		</div>
	{/if}
</div>
