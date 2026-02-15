<script lang="ts">
	interface Props {
		onclick?: () => void
		small?: boolean
	}

	let { onclick, small = false }: Props = $props()
</script>

<button
	aria-label="Face-down card"
	class="flex items-center justify-center rounded md:rounded-lg border border-blue-800 bg-blue-700 shadow-sm transition-all select-none
		{onclick ? 'cursor-pointer hover:bg-blue-600 active:scale-95' : 'cursor-default'}
		"
	style="width: {small ? 'var(--card-w-sm)' : 'var(--card-w)'}; height: {small ? 'var(--card-h-sm)' : 'var(--card-h)'}"
	onclick={onclick}
	type="button"
>
	<div class="rounded border border-blue-400 bg-blue-800 opacity-60" style="width: 65%; height: 70%"></div>
</button>
