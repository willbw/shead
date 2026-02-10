import type { Lobby_state } from '@shead/shared'

export const lobby_store = $state<{
  room: Lobby_state | null
  rooms: Lobby_state[]
}>({
  room: null,
  rooms: [],
})
