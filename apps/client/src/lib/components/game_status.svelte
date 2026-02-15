<script lang="ts">
	import { scale } from 'svelte/transition'

	interface Props {
		phase: 'swap' | 'play' | 'finished'
		current_player_name: string
		is_my_turn: boolean
		last_effect: 'burn' | 'reverse' | 'skip' | null
		action_log: string[]
		error_message: string | null
		on_dismiss_error?: () => void
	}

	let { phase, current_player_name, is_my_turn, last_effect, action_log, error_message, on_dismiss_error }: Props = $props()

	// Auto-dismiss error after 3s
	let error_timer: ReturnType<typeof setTimeout> | undefined
	$effect(() => {
		if (error_message) {
			clearTimeout(error_timer)
			error_timer = setTimeout(() => {
				if (on_dismiss_error) on_dismiss_error()
			}, 3000)
		}
		return () => clearTimeout(error_timer)
	})
</script>

<div class="flex flex-col items-center gap-1">
	{#if phase === 'swap'}
		<span class="text-sm font-medium text-purple-600">Swap Phase — arrange your cards, then Ready up</span>
	{:else if phase === 'play'}
		<span class="text-sm {is_my_turn ? 'font-bold text-yellow-300' : 'font-medium text-green-400'}">
			{is_my_turn ? 'Your turn!' : `${current_player_name}'s turn`}
		</span>
	{:else}
		<span class="text-sm font-medium text-gray-500">Game Over</span>
	{/if}

	{#if last_effect === 'burn'}
		<span class="text-xs font-semibold text-orange-500" transition:scale={{ duration: 300 }}>Pile burned!</span>
	{:else if last_effect === 'reverse'}
		<span class="text-xs font-semibold text-blue-500">Direction reversed!</span>
	{:else if last_effect === 'skip'}
		<span class="text-xs font-semibold text-purple-500" transition:scale={{ duration: 300 }}>Skip!</span>
	{/if}

	{#if action_log.length > 0}
		<div class="flex flex-col items-center">
			{#each action_log as text, i (text + i)}
				<span class="text-xs italic {i === action_log.length - 1 ? 'text-gray-300' : 'text-gray-500'}">{text}</span>
			{/each}
		</div>
	{/if}

	{#if error_message}
		{#key error_message}
			<span class="text-xs text-red-500 animate-shake">{error_message}</span>
		{/key}
	{/if}
</div>
