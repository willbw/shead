<script lang="ts">
	import { browser } from '$app/environment';
	import favicon from '$lib/assets/favicon.svg';
	import ConnectionIndicator from '$lib/components/connection_indicator.svelte';
	import MuteToggle from '$lib/components/mute_toggle.svelte';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>let's play cards</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if browser}
	<ConnectionIndicator />
	<MuteToggle />
{/if}
{@render children()}
