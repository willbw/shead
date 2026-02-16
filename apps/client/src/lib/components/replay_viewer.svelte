<script lang="ts">
	import { game_store } from '$lib/stores/game.svelte'
	import ShitheadReplayState from './shithead_replay_state.svelte'
	import GinRummyReplayState from './gin_rummy/replay_state.svelte'

	interface Props {
		game_type: string
		states: unknown[]
		player_names: Record<string, string>
	}

	let { game_type, states, player_names }: Props = $props()

	const index = $derived(game_store.replay_index)
	const total = $derived(states.length)

	// Use the initial state's player_order as a stable ordering that never shifts
	const initial_player_order: string[] = (states[0] as any)?.player_order ?? Object.keys(player_names)

	function go_first() { game_store.replay_index = 0 }
	function go_prev() { if (index > 0) game_store.replay_index = index - 1 }
	function go_next() { if (index < total - 1) game_store.replay_index = index + 1 }
	function go_last() { game_store.replay_index = total - 1 }

	function handle_keydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
		if (e.key === 'ArrowLeft') { e.preventDefault(); go_prev() }
		if (e.key === 'ArrowRight') { e.preventDefault(); go_next() }
		if (e.key === 'Home') { e.preventDefault(); go_first() }
		if (e.key === 'End') { e.preventDefault(); go_last() }
	}

	function close_replay() {
		game_store.replay_states = null
		game_store.replay_index = 0
	}
</script>

<svelte:window onkeydown={handle_keydown} />

<div class="flex flex-col items-center gap-3">
	<!-- Controls -->
	<div class="flex items-center gap-2">
		<button onclick={go_first} disabled={index === 0} class="rounded bg-green-700 px-2 py-1 text-xs font-medium hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed">First</button>
		<button onclick={go_prev} disabled={index === 0} class="rounded bg-green-700 px-3 py-1 text-sm font-medium hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
		<span class="text-sm text-green-300 min-w-[6rem] text-center">Step {index + 1} / {total}</span>
		<button onclick={go_next} disabled={index >= total - 1} class="rounded bg-green-700 px-3 py-1 text-sm font-medium hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
		<button onclick={go_last} disabled={index >= total - 1} class="rounded bg-green-700 px-2 py-1 text-xs font-medium hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed">Last</button>
	</div>
	<p class="text-xs text-green-500">Use arrow keys to navigate</p>

	<!-- Game-specific state renderer -->
	{#if game_type === 'shithead'}
		<ShitheadReplayState state={states[index]} {player_names} player_order={initial_player_order} />
	{:else if game_type === 'gin-rummy'}
		<GinRummyReplayState state={states[index]} {player_names} />
	{/if}

	<button onclick={close_replay} class="rounded bg-red-700 px-4 py-1.5 text-sm font-medium hover:bg-red-600">Close Replay</button>
</div>
