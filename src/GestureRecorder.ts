import { App, Platform, SuggestModal, apiVersion, normalizePath } from 'obsidian';
import {
	GestureTrace, TraceMarker, TraceWheelEvent, TRACE_VERSION,
	MOD_SHIFT, MOD_CTRL, MOD_ALT, MOD_META,
} from './trace';
import { absoluteEventTime, now } from './clock';

// === Constants ===

// Upper bound so a forgotten recording cannot grow without limit
// (~7 minutes of continuous 120 Hz trackpad input).
const MAX_TRACE_EVENTS = 50000;

// Folder inside the plugin directory where traces are saved
const TRACE_FOLDER = 'traces';

// Frames sampled to estimate the display refresh rate
const REFRESH_RATE_SAMPLE_FRAMES = 30;

interface LegacyWheelEvent extends WheelEvent {
	wheelDeltaX?: number;
	wheelDeltaY?: number;
}

// === Scenarios ===

export interface RecordingScenario {
	id: string;
	name: string;
	instructions: string;
}

export const RECORDING_SCENARIOS: RecordingScenario[] = [
	{ id: 'back-slow', name: 'Swipe back: slow', instructions: 'Slow, deliberate two-finger swipe back until the arrow appears, then lift. Repeat 5 times.' },
	{ id: 'back-fast', name: 'Swipe back: quick flick', instructions: 'Short, fast two-finger flick back. Repeat 5 times.' },
	{ id: 'back-hold', name: 'Swipe back: hold, then lift', instructions: 'Swipe back until the arrow appears, keep your fingers still on the trackpad for about 1 second, then lift. Repeat 3 times.' },
	{ id: 'back-cancel', name: 'Swipe back: cancel', instructions: 'Swipe back until the arrow appears, move back to the start without lifting, then lift. Repeat 3 times.' },
	{ id: 'forward', name: 'Swipe forward', instructions: 'Normal two-finger swipe forward. Repeat 5 times.' },
	{ id: 'vertical-scroll', name: 'Vertical scrolling', instructions: 'Scroll a long note up and down as usual, including fast flicks. About 15 seconds.' },
	{ id: 'scroll-then-swipe', name: 'Scroll, then swipe back', instructions: 'Scroll down with a quick flick, then swipe back right away while the note is still moving. Repeat 5 times.' },
	{ id: 'diagonal', name: 'Diagonal scrolling', instructions: 'Scroll vertically with sloppy, diagonal finger movement. About 15 seconds.' },
	{ id: 'scroll-container', name: 'Wide code block or table', instructions: 'Scroll horizontally inside a wide code block or table, to both edges and beyond. About 15 seconds.' },
	{ id: 'canvas-pan', name: 'Canvas panning', instructions: 'Pan around a Canvas with two fingers in all directions. About 15 seconds.' },
	{ id: 'mouse-shift-wheel', name: 'Mouse: Shift + wheel', instructions: 'With a mouse: hold Shift and turn the wheel a few notches in each direction.' },
	{ id: 'mouse-horizontal-wheel', name: 'Mouse: horizontal wheel', instructions: 'With a mouse: use the horizontal thumb or tilt wheel a few notches in each direction.' },
	{ id: 'three-finger', name: 'Three-finger swipe', instructions: 'Three-finger swipe back and forward (needs "Swipe between pages" set to three fingers in macOS). Repeat 3 times.' },
];

export class ScenarioSuggestModal extends SuggestModal<RecordingScenario> {
	private onChoose: (scenario: RecordingScenario) => void;

	constructor(app: App, onChoose: (scenario: RecordingScenario) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder('Pick a scenario to record, or type a custom name');
	}

	getSuggestions(query: string): RecordingScenario[] {
		const normalized = query.trim().toLowerCase();
		const matches = RECORDING_SCENARIOS.filter(scenario =>
			scenario.name.toLowerCase().includes(normalized) || scenario.id.includes(normalized));

		if (normalized && !RECORDING_SCENARIOS.some(scenario => scenario.name.toLowerCase() === normalized)) {
			matches.push({ id: slugify(query), name: query.trim(), instructions: 'Custom scenario' });
		}
		return matches;
	}

	renderSuggestion(scenario: RecordingScenario, el: HTMLElement) {
		el.createDiv({ text: scenario.name });
		el.createEl('small', { text: scenario.instructions, cls: 'swipe-nav-scenario-hint' });
	}

	onChooseSuggestion(scenario: RecordingScenario) {
		this.onChoose(scenario);
	}
}

// === Recorder ===

/**
 * Records raw wheel events plus plugin markers on one clock, so recorded
 * gestures can be replayed against the detection logic offline.
 */
export class GestureRecorder {
	private scenario: RecordingScenario | null = null;
	private startTime: number = 0;
	private events: TraceWheelEvent[] = [];
	private markers: TraceMarker[] = [];
	private truncated: boolean = false;
	private refreshRateHz: number | null = null;
	private session: number = 0;

	get isRecording(): boolean {
		return this.scenario !== null;
	}

	start(scenario: RecordingScenario) {
		this.scenario = scenario;
		this.startTime = now();
		this.events = [];
		this.markers = [];
		this.truncated = false;
		this.refreshRateHz = null;

		const session = ++this.session;
		void measureRefreshRate(window).then(hz => {
			if (session === this.session) this.refreshRateHz = hz;
		});
	}

	record(event: WheelEvent) {
		if (!this.scenario) return;
		if (this.events.length >= MAX_TRACE_EVENTS) {
			this.truncated = true;
			return;
		}

		const legacy = event as LegacyWheelEvent;
		this.events.push({
			t: round(absoluteEventTime(event) - this.startTime),
			dx: event.deltaX,
			dy: event.deltaY,
			mode: event.deltaMode,
			wdx: legacy.wheelDeltaX ?? 0,
			wdy: legacy.wheelDeltaY ?? 0,
			mods: modifierFlags(event),
		});
	}

	mark(type: string, data?: Record<string, unknown>) {
		if (!this.scenario) return;
		this.markers.push({ t: round(now() - this.startTime), type, data });
	}

	/** Stop recording and return the trace, or null if nothing was recording. */
	stop(context: { settings: Record<string, unknown>; pluginVersion: string }): GestureTrace | null {
		const scenario = this.scenario;
		if (!scenario) return null;
		this.scenario = null;
		this.session++;

		return {
			version: TRACE_VERSION,
			scenario: scenario.id,
			scenarioName: scenario.name,
			recordedAt: new Date(this.startTime).toISOString(),
			durationMs: round(now() - this.startTime),
			truncated: this.truncated,
			environment: {
				platform: Platform.isMacOS ? 'macos' : Platform.isWin ? 'windows' : Platform.isLinux ? 'linux' : 'other',
				userAgent: navigator.userAgent,
				obsidianApiVersion: apiVersion,
				electronVersion: typeof process !== 'undefined' ? process.versions.electron ?? 'unknown' : 'unknown',
				pluginVersion: context.pluginVersion,
				devicePixelRatio: window.devicePixelRatio,
				refreshRateHz: this.refreshRateHz,
			},
			settings: context.settings,
			events: this.events,
			markers: this.markers,
		};
	}
}

/** Write a trace as JSON into the plugin's trace folder and return its vault path. */
export async function saveTrace(app: App, pluginDir: string, trace: GestureTrace): Promise<string> {
	const adapter = app.vault.adapter;
	const folder = normalizePath(`${pluginDir}/${TRACE_FOLDER}`);
	if (!(await adapter.exists(folder))) {
		await adapter.mkdir(folder);
	}

	const stamp = trace.recordedAt.replace(/[:.]/g, '-');
	const path = normalizePath(`${folder}/${stamp}_${trace.scenario}.json`);
	await adapter.write(path, JSON.stringify(trace));
	return path;
}

// === Utilities ===

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function modifierFlags(event: WheelEvent): number {
	return (event.shiftKey ? MOD_SHIFT : 0)
		| (event.ctrlKey ? MOD_CTRL : 0)
		| (event.altKey ? MOD_ALT : 0)
		| (event.metaKey ? MOD_META : 0);
}

function slugify(text: string): string {
	return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
}

/** Estimate the display refresh rate from the median requestAnimationFrame interval. */
function measureRefreshRate(win: Window): Promise<number> {
	return new Promise(resolve => {
		const stamps: number[] = [];
		const step = (time: number) => {
			stamps.push(time);
			if (stamps.length <= REFRESH_RATE_SAMPLE_FRAMES) {
				win.requestAnimationFrame(step);
				return;
			}
			const intervals = stamps.slice(1).map((t, i) => t - stamps[i]).sort((a, b) => a - b);
			resolve(Math.round(1000 / intervals[Math.floor(intervals.length / 2)]));
		};
		win.requestAnimationFrame(step);
	});
}
