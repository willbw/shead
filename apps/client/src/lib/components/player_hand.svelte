<script lang="ts">
	import type { Card } from '@shead/shared'
	import { can_play_on, sort_cards } from '@shead/shared'
	import { fly } from 'svelte/transition'
	import { flip } from 'svelte/animate'
	import CardComponent from './card.svelte'
	import CardBack from './card_back.svelte'

	interface Props {
		hand: Card[]
		face_up: Card[]
		face_down_count: number
		discard_pile: Card[]
		selected_card_ids: string[]
		phase: 'swap' | 'play' | 'finished'
		is_current_turn: boolean
		on_card_click: (card_id: string, source: 'hand' | 'face_up' | 'face_down') => void
	}

	let { hand, face_up, face_down_count, discard_pile, selected_card_ids, phase, is_current_turn, on_card_click }: Props = $props()

	const sorted_hand = $derived(sort_cards(hand))

	/** Set of card IDs that are not the first of their rank group (should overlap). */
	const overlap_ids = $derived.by(() => {
		const ids = new Set<string>()
		for (let i = 1; i < sorted_hand.length; i++) {
			if (sorted_hand[i].rank === sorted_hand[i - 1].rank) {
				ids.add(sorted_hand[i].id)
			}
		}
		return ids
	})

	const playable_card_ids = $derived.by(() => {
		if (phase !== 'play') return new Set<string>()
		// Cards can be played from hand and face_up together
		const available = hand.length > 0 ? [...hand, ...face_up] : face_up.length > 0 ? face_up : []
		const ids = new Set<string>()
		for (const card of available) {
			if (can_play_on(card, discard_pile)) {
				ids.add(card.id)
			}
		}
		return ids
	})

	const show_hand = $derived(hand.length > 0)
	const show_face_up_active = $derived(hand.length === 0 && face_up.length > 0)
	const show_face_down = $derived(hand.length === 0 && face_up.length === 0 && face_down_count > 0)
</script>

<div class="flex flex-col items-center gap-2">
	{#if phase === 'swap'}
		<!-- Swap phase: show both hand and face-up for swapping -->
		<div class="flex flex-col items-center gap-1">
			<span class="text-xs text-gray-400 uppercase">Hand</span>
			<div class="flex flex-wrap justify-center">
				{#each sorted_hand as card (card.id)}
					<div
						class="{overlap_ids.has(card.id) ? '-ml-[calc(var(--card-w)*0.55)]' : 'ml-1'} first:ml-0"
						transition:fly={{ y: 30, duration: 200 }}
						animate:flip={{ duration: 200 }}
					>
						<CardComponent
							{card}
							selected={selected_card_ids.includes(card.id)}
							onclick={() => on_card_click(card.id, 'hand')}
						/>
					</div>
				{/each}
			</div>
		</div>
		<div class="flex flex-col items-center gap-1">
			<span class="text-xs text-gray-400 uppercase">Face Up</span>
			<div class="flex flex-wrap justify-center gap-1">
				{#each face_up as card (card.id)}
					<div transition:fly={{ y: 30, duration: 200 }} animate:flip={{ duration: 200 }}>
						<CardComponent
							{card}
							selected={selected_card_ids.includes(card.id)}
							onclick={() => on_card_click(card.id, 'face_up')}
						/>
					</div>
				{/each}
			</div>
		</div>
		<div class="flex flex-col items-center gap-1">
			<span class="text-xs text-gray-400 uppercase">Face Down</span>
			<div class="flex gap-1">
				{#each { length: face_down_count } as _, i (i)}
					<CardBack />
				{/each}
			</div>
		</div>
	{:else}
		<!-- Play phase: show the active card source -->
		{#if show_hand}
			<div class="flex flex-wrap justify-center">
				{#each sorted_hand as card (card.id)}
					<div
						class="{overlap_ids.has(card.id) ? '-ml-[calc(var(--card-w)*0.55)]' : 'ml-1'} first:ml-0"
						transition:fly={{ y: 30, duration: 200 }}
						animate:flip={{ duration: 200 }}
					>
						<CardComponent
							{card}
							selected={selected_card_ids.includes(card.id)}
							disabled={is_current_turn && !playable_card_ids.has(card.id)}
							onclick={is_current_turn ? () => on_card_click(card.id, 'hand') : undefined}
						/>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Face-up: show below hand, clickable when playable -->
		{#if face_up.length > 0}
			<div class="flex flex-col items-center gap-1">
				{#if hand.length > 0}
					<span class="text-xs text-gray-400 uppercase">Face Up</span>
				{/if}
				<div class="flex flex-wrap justify-center gap-1">
					{#each face_up as card (card.id)}
						<div transition:fly={{ y: 30, duration: 200 }} animate:flip={{ duration: 200 }}>
							<CardComponent
								{card}
								selected={selected_card_ids.includes(card.id)}
								disabled={is_current_turn && !playable_card_ids.has(card.id)}
								onclick={is_current_turn ? () => on_card_click(card.id, 'face_up') : undefined}
							/>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Face-down: only show when hand and face-up are both empty -->
		{#if show_face_down}
			<div class="flex flex-col items-center gap-1">
				<span class="text-xs text-gray-400 uppercase">Face Down ({face_down_count})</span>
				<div class="flex gap-1">
					{#each { length: face_down_count } as _, i (i)}
						<CardBack
							onclick={is_current_turn ? () => on_card_click(`face_down_${i}`, 'face_down') : undefined}
						/>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
