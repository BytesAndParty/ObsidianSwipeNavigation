// === Gesture Trace Format ===
// Shared by the in-app recorder (src/GestureRecorder.ts) and the offline
// analysis script (scripts/analyze-traces.ts). Types and constants only: it
// must not import 'obsidian', so the script can run outside Obsidian.

export const TRACE_VERSION = 1;

// Bit flags for modifier keys held during a wheel event
export const MOD_SHIFT = 1;
export const MOD_CTRL = 2;
export const MOD_ALT = 4;
export const MOD_META = 8;

export interface TraceWheelEvent {
	t: number;    // ms since recording start (from event.timeStamp)
	dx: number;   // deltaX
	dy: number;   // deltaY
	mode: number; // deltaMode: 0 = pixel, 1 = line, 2 = page
	wdx: number;  // legacy wheelDeltaX, multiples of 120 hint at a notched mouse wheel
	wdy: number;  // legacy wheelDeltaY
	mods: number; // MOD_* bit flags
}

// Plugin-side events (gesture start/end, navigation, file-open) on the same clock
export interface TraceMarker {
	t: number;
	type: string;
	data?: Record<string, unknown>;
}

export interface GestureTrace {
	version: number;
	scenario: string;
	scenarioName: string;
	recordedAt: string;
	durationMs: number;
	truncated: boolean;
	environment: {
		platform: string;
		userAgent: string;
		obsidianApiVersion: string;
		electronVersion: string;
		pluginVersion: string;
		devicePixelRatio: number;
		refreshRateHz: number | null;
	};
	settings: Record<string, unknown>;
	events: TraceWheelEvent[];
	markers: TraceMarker[];
}
