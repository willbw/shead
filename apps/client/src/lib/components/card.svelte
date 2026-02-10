<script lang="ts">
	import type { Card } from '@shead/shared'

	interface Props {
		card: Card
		selected?: boolean
		onclick?: () => void
	}

	let { card, selected = false, onclick }: Props = $props()

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
	class="flex flex-col items-center justify-center rounded-lg border-2 bg-white shadow-sm transition-all select-none
		{selected ? 'border-blue-500 ring-2 ring-blue-300 -translate-y-2' : 'border-gray-300'}
		{onclick ? 'cursor-pointer hover:border-gray-400 active:scale-95' : 'cursor-default'}"
	style="width: var(--card-w); height: var(--card-h); min-width: 40px; min-height: 44px"
	onclick={onclick}
	type="button"
>
	<span class="text-sm md:text-base font-bold {is_red ? 'text-red-600' : 'text-gray-900'}">{card.rank}</span>
	<span class="text-lg md:text-xl {is_red ? 'text-red-600' : 'text-gray-900'}">{suit_symbol}</span>
</button>
