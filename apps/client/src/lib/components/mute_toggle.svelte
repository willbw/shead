<script lang="ts">
	import { is_muted, set_muted } from '$lib/sounds'

	let muted = $state(is_muted())

	function toggle() {
		muted = !muted
		set_muted(muted)
	}
</script>

<button
	onclick={toggle}
	class="fixed bottom-3 right-3 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-gray-800/70 text-white hover:bg-gray-700/80 transition-colors"
	aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
	type="button"
>
	{#if muted}
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
			<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
			<line x1="23" y1="9" x2="17" y2="15" />
			<line x1="17" y1="9" x2="23" y2="15" />
		</svg>
	{:else}
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
			<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
			<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
			<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
		</svg>
	{/if}
</button>
