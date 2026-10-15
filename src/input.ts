// === Wheel Input Classification ===
// Pure functions shared by the plugin and scripts/analyze-traces.ts.
// Must not import 'obsidian', so the script can run outside Obsidian.

// Notched mouse wheels report the legacy wheelDelta in multiples of 120 per notch
// (macOS and Windows, at 100 % page zoom)
const MOUSE_WHEEL_NOTCH = 120;

// |wheelDeltaX / deltaX| of trackpads in Chromium, whose deltas can still be
// 120-multiples: macOS trackpads and Magic Mouse 3 (40 px per 120-unit tick),
// Windows precision touchpads 1. Mouse notches give e.g. 1.2 on Windows
// (120 / 100 px) and about 30 on macOS (120 / 4 px).
const TRACKPAD_WHEEL_DELTA_RATIOS = [3, 1];

// wheelDeltaX is truncated to an integer
const WHEEL_DELTA_TOLERANCE = 1.5;

/**
 * Trackpad gestures start with deltas of a few pixels. A notched mouse wheel
 * (including Shift + wheel and tilt/thumb wheels) starts with a full notch.
 * Misses high-resolution mice and notches at a page zoom other than 100 %.
 */
export function isLikelyMouseWheel(deltaMode: number, deltaX: number, wheelDeltaX: number): boolean {
	// 0 = DOM_DELTA_PIXEL; line or page deltas never come from a trackpad
	if (deltaMode !== 0) {
		return true;
	}
	if (wheelDeltaX === 0 || wheelDeltaX % MOUSE_WHEEL_NOTCH !== 0) {
		return false;
	}
	return TRACKPAD_WHEEL_DELTA_RATIOS.every(ratio =>
		Math.abs(Math.abs(wheelDeltaX) - Math.abs(deltaX) * ratio) > WHEEL_DELTA_TOLERANCE);
}
