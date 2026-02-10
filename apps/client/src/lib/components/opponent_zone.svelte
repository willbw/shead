<script lang="ts">
	import type { Visible_player_state } from '$lib/stores/game.svelte'
	import CardComponent from './card.svelte'
	import CardBack from './card_back.svelte'

	interface Props {
		player_id: string
		player_name: string
		state: Visible_player_state
		is_current_turn: boolean
	}

	let { player_name, state, is_current_turn }: Props = $props()
</script>

<div class="flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors duration-300 {is_current_turn ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-gray-50'}">
	<div class="flex items-center gap-1">
		<span class="text-sm font-medium {is_current_turn ? 'text-yellow-700' : 'text-gray-600'}">
			{player_name}
		</span>
		{#if is_current_turn}
			<span class="text-xs text-yellow-600">(playing)</span>
		{/if}
	</div>

	<!-- Hand count -->
	{#if state.hand_count > 0}
		<div class="flex items-center gap-1">
			<span class="text-xs text-gray-400">Hand:</span>
			<div class="flex -space-x-2 md:-space-x-3">
				{#each { length: Math.min(state.hand_count, 6) } as _, i (i)}
					<CardBack />
				{/each}
			</div>
			{#if state.hand_count > 6}
				<span class="text-xs text-gray-400">+{state.hand_count - 6}</span>
			{/if}
		</div>
	{/if}

	<!-- Face-up cards -->
	{#if state.face_up.length > 0}
		<div class="flex gap-1">
			{#each state.face_up as card (card.id)}
				<CardComponent {card} />
			{/each}
		</div>
	{/if}

	<!-- Face-down count -->
	{#if state.face_down_count > 0}
		<div class="flex gap-1">
			{#each { length: state.face_down_count } as _, i (i)}
				<CardBack />
			{/each}
		</div>
	{/if}
</div>
