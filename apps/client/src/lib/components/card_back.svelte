<script lang="ts">
	interface Props {
		onclick?: () => void
	}

	let { onclick }: Props = $props()
</script>

<button
	aria-label="Face-down card"
	class="flex items-center justify-center rounded-lg border-2 border-blue-800 bg-blue-700 shadow-sm transition-all select-none
		{onclick ? 'cursor-pointer hover:bg-blue-600 active:scale-95' : 'cursor-default'}"
	style="width: var(--card-w); height: var(--card-h); min-width: 40px; min-height: 44px"
	onclick={onclick}
	type="button"
>
	<div class="rounded border border-blue-400 bg-blue-800 opacity-60" style="width: 65%; height: 70%"></div>
</button>
