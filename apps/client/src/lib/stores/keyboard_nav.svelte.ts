export type Nav_row = 'hand' | 'face_up' | 'face_down' | 'actions'

export const keyboard_nav = $state<{
	active: boolean
	row: Nav_row
	col: number
}>({
	active: false,
	row: 'hand',
	col: 0,
})

export function reset_cursor() {
	keyboard_nav.active = false
	keyboard_nav.row = 'hand'
	keyboard_nav.col = 0
}

export function deactivate_cursor() {
	keyboard_nav.active = false
}
