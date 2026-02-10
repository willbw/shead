<script lang="ts">
	import type { Card } from '@shead/shared'

	interface Props {
		card: Card
		selected?: boolean
		disabled?: boolean
		on_pile?: boolean
		onclick?: () => void
	}

	let { card, selected = false, disabled = false, on_pile = false, onclick }: Props = $props()

	const HINT_TEXT: Record<string, string> = {
		'2': 'Reset',
		'3': 'Invisible',
		'7': '≤7',
		'8': 'Skip',
		'9': 'Odd only',
		'10': 'Burn',
		'Q': 'Reverse',
	}

	const hint = $derived(HINT_TEXT[card.rank])

	const SUIT_SYMBOLS: Record<string, string> = {
		hearts: '\u2665',
		diamonds: '\u2666',
		clubs: '\u2663',
		spades: '\u2660',
	}

	const is_red = $derived(card.suit === 'hearts' || card.suit === 'diamonds')
	const suit_symbol = $derived(SUIT_SYMBOLS[card.suit] ?? '?')
	const is_invisible = $derived(card.rank === '3' && on_pile)
</script>

<button
	class="flex flex-col items-center justify-center rounded-lg border-2 bg-white shadow-sm transition-all select-none
		{selected ? 'border-blue-500 ring-2 ring-blue-300 -translate-y-2' : 'border-gray-300'}
		{disabled ? 'opacity-40 cursor-not-allowed' : onclick ? 'cursor-pointer hover:border-gray-400 active:scale-95' : 'cursor-default'}
		{is_invisible ? 'opacity-50' : ''}"
	style="width: var(--card-w); height: var(--card-h); min-width: 40px; min-height: 44px"
	onclick={disabled ? undefined : onclick}
	type="button"
>
	<span class="text-sm md:text-base font-bold {is_red ? 'text-red-600' : 'text-gray-900'}">{card.rank}</span>
	<span class="text-lg md:text-xl {is_red ? 'text-red-600' : 'text-gray-900'}">{suit_symbol}</span>
	{#if hint}
		<span class="text-[8px] leading-none text-gray-400">{hint}</span>
	{/if}
</button>
