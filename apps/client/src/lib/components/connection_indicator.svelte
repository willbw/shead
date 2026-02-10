<script lang="ts">
	import { connection_store } from '$lib/stores/connection.svelte'
</script>

{#if !connection_store.connected}
	<div class="fixed top-0 left-0 right-0 z-50 bg-yellow-500 px-4 py-1 text-center text-sm font-medium text-yellow-900">
		Reconnecting...
	</div>
{/if}
