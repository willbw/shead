<script lang="ts">
	import type { Card } from '@shead/shared'
	import type { Snippet } from 'svelte'

	interface Props {
		card: Card
		selected?: boolean
		disabled?: boolean
		small?: boolean
		extra_classes?: string
		onclick?: () => void
		children?: Snippet
	}

	let { card, selected = false, disabled = false, small = false, extra_classes = '', onclick, children }: Props = $props()

	const SUIT_SYMBOLS: Record<string, string> = {
		hearts: '\u2665',
		diamonds: '\u2666',
		clubs: '\u2663',
		spades: '\u2660',
	}

	const is_red = $derived(card.suit === 'hearts' || card.suit === 'diamonds')
	const suit_symbol = $derived(SUIT_SYMBOLS[card.suit] ?? '?')
</script>

<button
	class="flex flex-col items-center justify-center rounded md:rounded-lg border bg-white shadow-sm transition-all select-none
		{selected ? 'border-blue-500 ring-2 ring-blue-300 -translate-y-1 md:-translate-y-2' : 'border-gray-300'}
		{disabled ? 'opacity-40 cursor-not-allowed' : onclick ? 'cursor-pointer hover:border-gray-400 active:scale-95' : 'cursor-default'}
		{extra_classes}"
	style="width: {small ? 'var(--card-w-sm)' : 'var(--card-w)'}; height: {small ? 'var(--card-h-sm)' : 'var(--card-h)'}"
	onclick={disabled ? undefined : onclick}
	type="button"
>
	<span class="{small ? 'text-[10px]' : 'text-xs md:text-base'} font-bold leading-tight {is_red ? 'text-red-600' : 'text-gray-900'}">{card.rank}</span>
	<span class="{small ? 'text-xs' : 'text-sm md:text-xl'} leading-tight {is_red ? 'text-red-600' : 'text-gray-900'}">{suit_symbol}</span>
	{@render children?.()}
</button>
