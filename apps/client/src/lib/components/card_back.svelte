<script lang="ts">
	interface Props {
		onclick?: () => void
	}

	let { onclick }: Props = $props()
</script>

<button
	aria-label="Face-down card"
	class="flex h-20 w-14 items-center justify-center rounded-lg border-2 border-blue-800 bg-blue-700 shadow-sm transition-all select-none
		{onclick ? 'cursor-pointer hover:bg-blue-600 active:scale-95' : 'cursor-default'}"
	style="min-width: 44px; min-height: 44px"
	onclick={onclick}
	type="button"
>
	<div class="h-14 w-9 rounded border border-blue-400 bg-blue-800 opacity-60"></div>
</button>
