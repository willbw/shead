<script lang="ts">
	import type { Card } from '@shead/shared'
	import { fly } from 'svelte/transition'
	import { flip } from 'svelte/animate'
	import CardComponent from './card.svelte'
	import CardBack from './card_back.svelte'

	interface Props {
		hand: Card[]
		face_up: Card[]
		face_down_count: number
		selected_card_ids: string[]
		phase: 'swap' | 'play' | 'finished'
		is_current_turn: boolean
		on_card_click: (card_id: string, source: 'hand' | 'face_up' | 'face_down') => void
	}

	let { hand, face_up, face_down_count, selected_card_ids, phase, is_current_turn, on_card_click }: Props = $props()

	const show_hand = $derived(hand.length > 0)
	const show_face_up = $derived(hand.length === 0 && face_up.length > 0)
	const show_face_down = $derived(hand.length === 0 && face_up.length === 0 && face_down_count > 0)
</script>

<div class="flex flex-col items-center gap-2">
	{#if phase === 'swap'}
		<!-- Swap phase: show both hand and face-up for swapping -->
		<div class="flex flex-col items-center gap-1">
			<span class="text-xs text-gray-400 uppercase">Hand</span>
			<div class="flex flex-wrap justify-center gap-1">
				{#each hand as card (card.id)}
					<div transition:fly={{ y: 30, duration: 200 }} animate:flip={{ duration: 200 }}>
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
			<div class="flex flex-wrap justify-center gap-1">
				{#each hand as card (card.id)}
					<div transition:fly={{ y: 30, duration: 200 }} animate:flip={{ duration: 200 }}>
						<CardComponent
							{card}
							selected={selected_card_ids.includes(card.id)}
							onclick={is_current_turn ? () => on_card_click(card.id, 'hand') : undefined}
						/>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Face-up: show below hand, or as active source when hand is empty -->
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
								onclick={show_face_up && is_current_turn ? () => on_card_click(card.id, 'face_up') : undefined}
							/>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Face-down: show below everything, clickable only when active -->
		{#if face_down_count > 0}
			<div class="flex flex-col items-center gap-1">
				<span class="text-xs text-gray-400 uppercase">Face Down ({face_down_count})</span>
				<div class="flex gap-1">
					{#each { length: face_down_count } as _, i (i)}
						<CardBack
							onclick={show_face_down && is_current_turn ? () => on_card_click(`face_down_${i}`, 'face_down') : undefined}
						/>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
