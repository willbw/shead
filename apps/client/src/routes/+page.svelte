<script lang="ts">
	import { goto } from '$app/navigation'
	import { connection_store } from '$lib/stores/connection.svelte'
	import { lobby_store } from '$lib/stores/lobby.svelte'
	import { connect, set_name, create_room, join_room, list_rooms } from '$lib/socket'

	let name_input = $state('')
	let join_code = $state('')
	let error = $state('')
	let loading = $state(false)

	$effect(() => {
		if (!connection_store.connected) {
			connect()
		}
	})

	// Poll rooms while on this page
	let rooms_interval: ReturnType<typeof setInterval> | undefined
	$effect(() => {
		if (connection_store.connected) {
			list_rooms()
			rooms_interval = setInterval(() => list_rooms(), 3000)
		}
		return () => {
			if (rooms_interval) clearInterval(rooms_interval)
		}
	})

	async function handle_set_name() {
		if (!name_input.trim()) return
		error = ''
		try {
			await set_name(name_input.trim())
		} catch (e) {
			error = (e as Error).message
		}
	}

	async function handle_create() {
		error = ''
		loading = true
		try {
			if (!connection_store.player_name) {
				await set_name(name_input.trim() || `Player-${connection_store.player_id.slice(0, 4)}`)
			}
			await create_room()
			goto('/game')
		} catch (e) {
			error = (e as Error).message
		} finally {
			loading = false
		}
	}

	async function handle_join(room_id?: string) {
		const id = room_id ?? join_code.trim()
		if (!id) return
		error = ''
		loading = true
		try {
			if (!connection_store.player_name) {
				await set_name(name_input.trim() || `Player-${connection_store.player_id.slice(0, 4)}`)
			}
			await join_room(id)
			goto('/game')
		} catch (e) {
			error = (e as Error).message
		} finally {
			loading = false
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100 p-4">
	<div class="w-full max-w-md space-y-6">
		<div class="text-center">
			<h1 class="text-4xl font-bold text-gray-900">Shithead</h1>
			<p class="mt-1 text-sm text-gray-500">Multiplayer card game</p>
		</div>

		<!-- Connection status -->
		<div class="flex items-center justify-center gap-2">
			<div class="h-2 w-2 rounded-full {connection_store.connected ? 'bg-green-500' : 'bg-red-500'}"></div>
			<span class="text-xs text-gray-400">{connection_store.connected ? 'Connected' : 'Connecting...'}</span>
		</div>

		{#if error}
			<div class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
		{/if}

		<!-- Name input -->
		<div class="rounded-lg bg-white p-4 shadow-sm">
			<label for="name" class="block text-sm font-medium text-gray-700">Your Name</label>
			<div class="mt-1 flex gap-2">
				<input
					id="name"
					type="text"
					bind:value={name_input}
					placeholder="Enter your name"
					maxlength={20}
					class="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
					onkeydown={(e) => { if (e.key === 'Enter') handle_set_name() }}
				/>
				<button
					onclick={handle_set_name}
					disabled={!connection_store.connected || !name_input.trim()}
					class="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Set
				</button>
			</div>
			{#if connection_store.player_name}
				<p class="mt-1 text-xs text-green-600">Playing as: {connection_store.player_name}</p>
			{/if}
		</div>

		<!-- Create / Join -->
		<div class="rounded-lg bg-white p-4 shadow-sm space-y-3">
			<button
				onclick={handle_create}
				disabled={!connection_store.connected || loading}
				class="w-full rounded bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{loading ? 'Loading...' : 'Create Game'}
			</button>

			<div class="flex items-center gap-2">
				<div class="h-px flex-1 bg-gray-200"></div>
				<span class="text-xs text-gray-400">or join</span>
				<div class="h-px flex-1 bg-gray-200"></div>
			</div>

			<div class="flex gap-2">
				<input
					type="text"
					bind:value={join_code}
					placeholder="Room code"
					class="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
					onkeydown={(e) => { if (e.key === 'Enter') handle_join() }}
				/>
				<button
					onclick={() => handle_join()}
					disabled={!connection_store.connected || !join_code.trim() || loading}
					class="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Join
				</button>
			</div>
		</div>

		<!-- Room List -->
		{#if lobby_store.rooms.length > 0}
			<div class="rounded-lg bg-white p-4 shadow-sm">
				<h2 class="text-sm font-medium text-gray-700 mb-2">Open Rooms</h2>
				<div class="space-y-2">
					{#each lobby_store.rooms.filter(r => r.status === 'waiting') as room (room.room_id)}
						<div class="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
							<div>
								<span class="text-sm font-medium text-gray-800">{room.room_id.slice(0, 8)}</span>
								<span class="ml-2 text-xs text-gray-400">{room.players.length} player{room.players.length !== 1 ? 's' : ''}</span>
							</div>
							<button
								onclick={() => handle_join(room.room_id)}
								disabled={!connection_store.connected || loading}
								class="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50"
							>
								Join
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
