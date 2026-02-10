<script lang="ts">
	interface Props {
		phase: 'swap' | 'play' | 'finished'
		current_player_name: string
		is_my_turn: boolean
		last_effect: 'burn' | 'reverse' | null
		error_message: string | null
	}

	let { phase, current_player_name, is_my_turn, last_effect, error_message }: Props = $props()
</script>

<div class="flex flex-col items-center gap-1">
	{#if phase === 'swap'}
		<span class="text-sm font-medium text-purple-600">Swap Phase — arrange your cards, then Ready up</span>
	{:else if phase === 'play'}
		<span class="text-sm font-medium {is_my_turn ? 'text-green-600' : 'text-gray-500'}">
			{is_my_turn ? 'Your turn!' : `${current_player_name}'s turn`}
		</span>
	{:else}
		<span class="text-sm font-medium text-gray-500">Game Over</span>
	{/if}

	{#if last_effect === 'burn'}
		<span class="text-xs font-semibold text-orange-500">Pile burned!</span>
	{:else if last_effect === 'reverse'}
		<span class="text-xs font-semibold text-blue-500">Direction reversed!</span>
	{/if}

	{#if error_message}
		<span class="text-xs text-red-500">{error_message}</span>
	{/if}
</div>
