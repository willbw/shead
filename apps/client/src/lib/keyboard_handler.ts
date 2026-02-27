import { KEYMAP } from './keymap'
import { keyboard_nav, type Nav_row } from './stores/keyboard_nav.svelte'

export interface Keyboard_context {
	/** Rows available for navigation, in top-to-bottom order */
	available_rows: Nav_row[]
	/** Number of items in each row */
	row_sizes: Record<Nav_row, number>
	/** Called when h/l/Space selects a card at a position (like clicking it) */
	on_toggle_select: (row: Nav_row, col: number) => void
	/** Called when Enter is pressed on a card row */
	on_confirm_cards: () => void
	/** Called when Enter is pressed on the actions row */
	on_confirm_action: (col: number) => void
	/** Called when Escape is pressed */
	on_deselect_all: () => void
	/** Called after j/k changes row. Can override keyboard_nav.col for custom positioning. */
	on_row_change?: (from: Nav_row, to: Nav_row) => void
}

function activate_and_clamp(ctx: Keyboard_context) {
	keyboard_nav.active = true
	// Ensure current row is available
	if (!ctx.available_rows.includes(keyboard_nav.row)) {
		keyboard_nav.row = ctx.available_rows[0] ?? 'hand'
	}
	// Clamp col
	const max = (ctx.row_sizes[keyboard_nav.row] ?? 1) - 1
	if (keyboard_nav.col > max) keyboard_nav.col = Math.max(0, max)
}

function change_row(ctx: Keyboard_context, from: Nav_row, to: Nav_row) {
	keyboard_nav.row = to
	const new_size = ctx.row_sizes[to] ?? 1
	if (keyboard_nav.col >= new_size) keyboard_nav.col = Math.max(0, new_size - 1)
	ctx.on_row_change?.(from, to)
}

export function handle_keyboard_event(e: KeyboardEvent, ctx: Keyboard_context) {
	if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
	if (ctx.available_rows.length === 0) return

	const key = e.key

	// Check if this is a key we handle
	const is_nav_key =
		key === KEYMAP.cursor_left ||
		key === KEYMAP.cursor_right ||
		key === KEYMAP.cursor_up ||
		key === KEYMAP.cursor_down ||
		key === KEYMAP.select ||
		key === KEYMAP.confirm ||
		key === KEYMAP.deselect_all

	if (!is_nav_key) return

	e.preventDefault()

	// Activate on first nav key press
	if (!keyboard_nav.active) {
		activate_and_clamp(ctx)
		// For movement keys, just activate without acting
		if (key !== KEYMAP.confirm && key !== KEYMAP.deselect_all) return
	}

	const row_idx = ctx.available_rows.indexOf(keyboard_nav.row)
	const row_size = ctx.row_sizes[keyboard_nav.row] ?? 0

	if (key === KEYMAP.cursor_left) {
		if (keyboard_nav.col > 0) {
			keyboard_nav.col--
		}
		// On card rows, moving selects (like clicking)
		if (keyboard_nav.row !== 'actions') {
			ctx.on_toggle_select(keyboard_nav.row, keyboard_nav.col)
		}
	} else if (key === KEYMAP.cursor_right) {
		if (keyboard_nav.col < row_size - 1) {
			keyboard_nav.col++
		}
		if (keyboard_nav.row !== 'actions') {
			ctx.on_toggle_select(keyboard_nav.row, keyboard_nav.col)
		}
	} else if (key === KEYMAP.cursor_up) {
		if (row_idx > 0) {
			change_row(ctx, keyboard_nav.row, ctx.available_rows[row_idx - 1])
		}
	} else if (key === KEYMAP.cursor_down) {
		if (row_idx < ctx.available_rows.length - 1) {
			change_row(ctx, keyboard_nav.row, ctx.available_rows[row_idx + 1])
		}
	} else if (key === KEYMAP.select) {
		if (keyboard_nav.row !== 'actions') {
			ctx.on_toggle_select(keyboard_nav.row, keyboard_nav.col)
		}
	} else if (key === KEYMAP.confirm) {
		if (keyboard_nav.row === 'actions') {
			ctx.on_confirm_action(keyboard_nav.col)
		} else {
			ctx.on_confirm_cards()
		}
	} else if (key === KEYMAP.deselect_all) {
		ctx.on_deselect_all()
	}
}
