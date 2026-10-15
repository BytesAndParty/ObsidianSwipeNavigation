import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { GestureRecognizer, SwipeDirection } from '../src/GestureRecognizer';
import { isLikelyMouseWheel } from '../src/input';
import { DEFAULT_SETTINGS, SWIPE_THRESHOLD_MULTIPLIER } from '../src/types';
import type { GestureTrace } from '../src/trace';

// Replays traces recorded with "Start gesture recording" (copy them to
// test/fixtures/traces/) and checks the outcome per scenario. Pane, sidebar
// and scroll-container checks need the DOM, so only the input-based part of
// the gesture context is replayed and those scenarios are skipped.

const FIXTURES = join(import.meta.dir, 'fixtures', 'traces');

// Which navigations each recorded scenario may produce
const EXPECTED: Record<string, { only: SwipeDirection | null; atLeastOne: boolean }> = {
	'back-slow': { only: 'back', atLeastOne: true },
	'back-fast': { only: 'back', atLeastOne: true },
	'back-hold': { only: 'back', atLeastOne: true },
	'back-cancel': { only: null, atLeastOne: false },
	'forward': { only: 'forward', atLeastOne: true },
	'scroll-then-swipe': { only: 'back', atLeastOne: true },
	'vertical-scroll': { only: null, atLeastOne: false },
	'diagonal': { only: null, atLeastOne: false },
	'mouse-shift-wheel': { only: null, atLeastOne: false },
	'mouse-horizontal-wheel': { only: null, atLeastOne: false },
	'three-finger': { only: null, atLeastOne: false },
};

function replay(trace: GestureTrace): SwipeDirection[] {
	const sensitivity = typeof trace.settings.sensitivity === 'number' ? trace.settings.sensitivity : DEFAULT_SETTINGS.sensitivity;
	const sign = trace.settings.invertDirection === true ? -1 : 1;
	const navigations: SwipeDirection[] = [];

	const recognizer = new GestureRecognizer({
		axis: () => {},
		progress: () => {},
		release: release => {
			if (release.navigate && release.direction) navigations.push(release.direction);
		},
		end: () => {},
	}, sensitivity * SWIPE_THRESHOLD_MULTIPLIER);

	for (const event of trace.events) {
		recognizer.feed({ t: event.t, dx: event.dx * sign, dy: event.dy },
			() => event.mods === 0 && !isLikelyMouseWheel(event.mode, event.dx, event.wdx));
	}
	const last = trace.events[trace.events.length - 1];
	recognizer.tick((last?.t ?? 0) + 10_000);
	return navigations;
}

const files = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter(name => name.endsWith('.json')).sort() : [];

describe('recorded traces', () => {
	if (files.length === 0) {
		test.skip('no recorded traces in test/fixtures/traces yet', () => {});
	}

	for (const name of files) {
		const trace = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as GestureTrace;
		const expected = EXPECTED[trace.scenario];

		test.skipIf(!expected)(`${trace.scenarioName} (${name})`, () => {
			const navigations = replay(trace);
			if (expected.atLeastOne) {
				expect(navigations.length).toBeGreaterThan(0);
			}
			expect(navigations.filter(direction => direction !== expected.only)).toEqual([]);
		});
	}
});
