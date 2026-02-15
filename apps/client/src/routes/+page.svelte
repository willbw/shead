<script lang="ts">
	import { goto } from '$app/navigation'
	import { connection_store } from '$lib/stores/connection.svelte'
	import { lobby_store } from '$lib/stores/lobby.svelte'
	import { connect, create_room, set_name, practice_vs_bot, leave_room } from '$lib/socket.svelte'

	let error = $state('')
	let loading = $state(false)
	let practice_loading = $state<string | false>(false)
	const is_practice_loading = $derived(!!practice_loading)
	let join_code = $state('')
	let selected_game = $state<'shithead' | 'gin-rummy'>('shithead')

	function handle_join() {
		const code = join_code.trim()
		if (!code) return
		goto('/' + code)
	}

	$effect(() => {
		if (!connection_store.connected) {
			connect()
		}
	})

	async function handle_create() {
		error = ''
		loading = true
		try {
			const room = await create_room(selected_game)
			goto('/' + room.room_id)
		} catch (e) {
			error = (e as Error).message
		} finally {
			loading = false
		}
	}

	async function handle_practice(difficulty: 'easy' | 'medium' | 'hard', bot_count: number = 1) {
		error = ''
		practice_loading = `${difficulty}-${bot_count}`
		try {
			if (!connection_store.player_name || connection_store.player_name.startsWith('Player-')) {
				await set_name('Player')
			}
			const room = await practice_vs_bot(selected_game, difficulty, bot_count)
			goto('/' + room.room_id)
		} catch (e) {
			error = (e as Error).message
		} finally {
			practice_loading = false
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100 p-4">
	<div class="w-full max-w-md space-y-6">
		<div class="text-center">
			<h1 class="text-4xl font-bold text-gray-900">Shead</h1>
			<p class="mt-1 text-sm text-gray-500">Multiplayer card games</p>
		</div>

		{#if lobby_store.room}
			<div class="rounded-lg bg-yellow-50 border border-yellow-200 p-4 space-y-2">
				<p class="text-sm text-yellow-800">You're in room <span class="font-bold">{lobby_store.room.room_id}</span></p>
				<div class="flex gap-2">
					<button
						onclick={() => goto('/' + lobby_store.room!.room_id)}
						class="flex-1 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
					>
						Rejoin
					</button>
					<button
						onclick={async () => { try { await leave_room() } catch {} }}
						class="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
					>
						Leave Room
					</button>
				</div>
			</div>
		{/if}

		{#if error}
			<div class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
		{/if}

		<!-- Game Type Selector -->
		<div class="flex rounded-lg bg-white shadow-sm overflow-hidden">
			<button
				onclick={() => selected_game = 'shithead'}
				class="flex-1 px-4 py-3 text-sm font-medium transition-colors {selected_game === 'shithead' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-50'}"
			>
				Shithead
			</button>
			<button
				onclick={() => selected_game = 'gin-rummy'}
				class="flex-1 px-4 py-3 text-sm font-medium transition-colors {selected_game === 'gin-rummy' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-50'}"
			>
				Gin Rummy
			</button>
		</div>

		<div class="rounded-lg bg-white p-4 shadow-sm space-y-3">
			<p class="text-center text-sm font-medium text-gray-700">Practice vs Bot</p>
			<div class="space-y-2">
				<p class="text-xs text-gray-400 text-center">1v1</p>
				<div class="flex gap-2">
					<button
						onclick={() => handle_practice('easy')}
						disabled={!connection_store.connected || is_practice_loading}
						class="flex-1 rounded bg-green-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{practice_loading === 'easy-1' ? 'Starting...' : 'Easy'}
					</button>
					<button
						onclick={() => handle_practice('medium')}
						disabled={!connection_store.connected || is_practice_loading}
						class="flex-1 rounded bg-yellow-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{practice_loading === 'medium-1' ? 'Starting...' : 'Medium'}
					</button>
					<button
						onclick={() => handle_practice('hard')}
						disabled={!connection_store.connected || is_practice_loading}
						class="flex-1 rounded bg-red-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{practice_loading === 'hard-1' ? 'Starting...' : 'Hard'}
					</button>
				</div>
				{#if selected_game === 'shithead'}
					<p class="text-xs text-gray-400 text-center">4-Player</p>
					<div class="flex gap-2">
						<button
							onclick={() => handle_practice('easy', 3)}
							disabled={!connection_store.connected || is_practice_loading}
							class="flex-1 rounded bg-green-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{practice_loading === 'easy-3' ? 'Starting...' : 'Easy'}
						</button>
						<button
							onclick={() => handle_practice('medium', 3)}
							disabled={!connection_store.connected || is_practice_loading}
							class="flex-1 rounded bg-yellow-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{practice_loading === 'medium-3' ? 'Starting...' : 'Medium'}
						</button>
						<button
							onclick={() => handle_practice('hard', 3)}
							disabled={!connection_store.connected || is_practice_loading}
							class="flex-1 rounded bg-red-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{practice_loading === 'hard-3' ? 'Starting...' : 'Hard'}
						</button>
					</div>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<div class="h-px flex-1 bg-gray-200"></div>
				<span class="text-xs text-gray-400">or play with friends</span>
				<div class="h-px flex-1 bg-gray-200"></div>
			</div>

			<button
				onclick={handle_create}
				disabled={!connection_store.connected || loading}
				class="w-full rounded bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{loading ? 'Creating...' : 'Create Game'}
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
					maxlength={6}
					class="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
					onkeydown={(e) => { if (e.key === 'Enter') handle_join() }}
				/>
				<button
					onclick={handle_join}
					disabled={!join_code.trim()}
					class="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Join
				</button>
			</div>
		</div>
	</div>
</div>
