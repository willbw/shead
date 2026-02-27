<script lang="ts">
	interface Props {
		onclick?: () => void
		small?: boolean
		selected?: boolean
	}

	let { onclick, small = false, selected = false }: Props = $props()
</script>

<button
	aria-label="Face-down card"
	class="flex items-center justify-center rounded md:rounded-lg border shadow-sm transition-all select-none
		{selected ? 'border-blue-300 ring-2 ring-blue-300 -translate-y-1 md:-translate-y-2' : 'border-blue-800'}
		{onclick ? 'cursor-pointer hover:bg-blue-600 active:scale-95' : 'cursor-default'}
		bg-blue-700"
	style="width: {small ? 'var(--card-w-sm)' : 'var(--card-w)'}; height: {small ? 'var(--card-h-sm)' : 'var(--card-h)'}"
	onclick={onclick}
	type="button"
>
	<div class="rounded border border-blue-400 bg-blue-800 opacity-60" style="width: 65%; height: 70%"></div>
</button>
