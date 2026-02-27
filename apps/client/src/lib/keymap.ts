export const KEYMAP = {
	cursor_left: 'h',
	cursor_right: 'l',
	cursor_up: 'k',
	cursor_down: 'j',
	select: ' ',
	confirm: 'Enter',
	deselect_all: 'Escape',
} as const

export type Keymap_action = keyof typeof KEYMAP
