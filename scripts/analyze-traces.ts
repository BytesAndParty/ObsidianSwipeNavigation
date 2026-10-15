// Summarise gesture traces recorded with the "Start gesture recording" command.
//
// Usage: bun run analyze-traces <trace.json | folder> [...more]
//
// Splits each trace into gestures at gaps without wheel events and prints one
// row per gesture, so input patterns (momentum tails, zero-delta lift events,
// mouse notches, refresh-rate dependent deltas) can be compared per scenario.

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { GestureTrace, TraceMarker, TraceWheelEvent } from '../src/trace';
import { isLikelyMouseWheel } from '../src/input';

// Gap without wheel events that separates two gestures
const GESTURE_GAP_MS = 150;

// Markers this long after a gesture's last event still belong to it
// (a timeout release fires 400 ms after the last event, see GestureRecognizer.ts)
const MARKER_TAIL_MS = 500;

interface GestureRow {
	'#': number;
	start: number;
	ms: number;
	n: number;
	'Σdx': number;
	'Σdy': number;
	'max|dx|': number;
	'wdx/dx': number | string;
	'Δt med': number;
	zero: number;
	'tail↓': number;
	'first dx': string;
	'last dx': string;
	markers: string;
}

function collectFiles(paths: string[]): string[] {
	const files: string[] = [];
	for (const path of paths) {
		if (statSync(path).isDirectory()) {
			for (const name of readdirSync(path).sort()) {
				if (name.endsWith('.json')) files.push(join(path, name));
			}
		} else {
			files.push(path);
		}
	}
	return files;
}

function splitGestures(events: TraceWheelEvent[]): TraceWheelEvent[][] {
	const gestures: TraceWheelEvent[][] = [];
	let current: TraceWheelEvent[] = [];
	for (const event of events) {
		if (current.length > 0 && event.t - current[current.length - 1].t > GESTURE_GAP_MS) {
			gestures.push(current);
			current = [];
		}
		current.push(event);
	}
	if (current.length > 0) gestures.push(current);
	return gestures;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = values.slice().sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

function round(value: number, digits = 1): number {
	const factor = Math.pow(10, digits);
	return Math.round(value * factor) / factor;
}

/**
 * Length of the trailing run where the dominant delta never grows.
 * Momentum after lifting the fingers shows up as a long, smoothly decaying tail.
 */
function decayingTailLength(events: TraceWheelEvent[]): number {
	const magnitude = (e: TraceWheelEvent) => Math.max(Math.abs(e.dx), Math.abs(e.dy));
	let length = 1;
	for (let i = events.length - 1; i > 0; i--) {
		if (magnitude(events[i]) <= magnitude(events[i - 1])) length++;
		else break;
	}
	return length;
}

function summariseGesture(index: number, events: TraceWheelEvent[], markers: TraceMarker[]): GestureRow {
	const first = events[0];
	const last = events[events.length - 1];
	const intervals = events.slice(1).map((event, i) => event.t - events[i].t);
	const inGesture = markers.filter(m => m.t >= first.t - 1 && m.t <= last.t + MARKER_TAIL_MS);

	return {
		'#': index + 1,
		start: Math.round(first.t),
		ms: Math.round(last.t - first.t),
		n: events.length,
		'Σdx': round(events.reduce((sum, e) => sum + e.dx, 0)),
		'Σdy': round(events.reduce((sum, e) => sum + e.dy, 0)),
		'max|dx|': round(Math.max(...events.map(e => Math.abs(e.dx)))),
		'wdx/dx': wheelDeltaRatio(events),
		'Δt med': round(median(intervals)),
		zero: events.filter(e => e.dx === 0 && e.dy === 0).length,
		'tail↓': decayingTailLength(events),
		'first dx': events.slice(0, 5).map(e => round(e.dx)).join(' '),
		'last dx': events.slice(-5).map(e => round(e.dx)).join(' '),
		markers: inGesture.map(markerLabel).join(', '),
	};
}

/**
 * Median of |wheelDeltaX / deltaX|. Chromium on macOS reports 3 for trackpads;
 * a mouse notch gives a different ratio (e.g. 120 / 100 on Windows). (F26)
 */
function wheelDeltaRatio(events: TraceWheelEvent[]): number | string {
	const ratios = events.filter(e => e.dx !== 0 && e.wdx !== 0).map(e => Math.abs(e.wdx / e.dx));
	return ratios.length > 0 ? round(median(ratios), 2) : '-';
}

function markerLabel(marker: TraceMarker): string {
	const data = marker.data ?? {};
	switch (marker.type) {
		case 'gesture-start':
			return data.accepted ? `start(${data.viewType})` : `rejected(${data.reason})`;
		case 'axis':
			return `axis(${data.axis === 'horizontal' ? 'h' : 'v'})`;
		case 'release':
			return `${data.navigate ? 'COMMIT' : 'cancel'}(${data.reason})@${Math.round(marker.t)}`;
		case 'navigate':
			return `NAV ${data.direction}@${Math.round(marker.t)}`;
		case 'threshold':
			return data.reached ? `ready@${Math.round(marker.t)}` : 'unready';
		case 'file-open':
			return `open@${Math.round(marker.t)}`;
		default:
			return marker.type;
	}
}

function analyse(file: string) {
	const trace = JSON.parse(readFileSync(file, 'utf8')) as GestureTrace;
	const env = trace.environment;
	const mouseLike = trace.events.filter(e => isLikelyMouseWheel(e.mode, e.dx, e.wdx)).length;
	const withModifiers = trace.events.filter(e => e.mods !== 0).length;

	console.log(`\n=== ${trace.scenarioName} (${trace.scenario}) — ${file}`);
	console.log(
		`${env.platform}, ${env.refreshRateHz ?? '?'} Hz, DPR ${env.devicePixelRatio}, Electron ${env.electronVersion}, ` +
		`${trace.events.length} events in ${Math.round(trace.durationMs)} ms` +
		`${trace.truncated ? ' (TRUNCATED)' : ''}, mouse-like notches: ${mouseLike}, with modifiers: ${withModifiers}`,
	);

	const gestures = splitGestures(trace.events);
	console.table(gestures.map((events, i) => summariseGesture(i, events, trace.markers)));
}

const args = process.argv.slice(2);
if (args.length === 0) {
	console.error('Usage: bun run analyze-traces <trace.json | folder> [...more]');
	process.exit(1);
}
collectFiles(args).forEach(analyse);
