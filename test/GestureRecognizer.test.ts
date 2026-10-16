import { describe, expect, test } from 'bun:test';
import {
	GestureRecognizer, RecognizerConfig, SwipeDirection, SwipeRelease, WheelSample,
} from '../src/GestureRecognizer';

// Synthetic gestures. Finger strokes follow the minimum-jerk profile people
// use to move between two points at rest; momentum decays geometrically per
// frame; deltas are integers with carry, like macOS trackpads in Chromium.
// The replay test checks the recognizer against recorded traces.

const FRAME_60HZ = 1000 / 60;
const FRAME_120HZ = 1000 / 120;
const THRESHOLD = 150;

/** Position along a minimum-jerk stroke, s and result from 0 to 1 */
function minJerk(s: number): number {
	return 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5;
}

/** Speed at s as a multiple of distance / duration */
function minJerkSpeed(s: number): number {
	return 30 * s ** 2 * (1 - s) ** 2;
}

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32) */
function seeded(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

class Gesture {
	t = 1000;
	readonly samples: WheelSample[] = [];
	private carryX = 0;
	private carryY = 0;

	constructor(readonly interval: number = FRAME_60HZ) {}

	/** count events with exactly the same delta (idealized input) */
	move(dx: number, count: number, { dy = 0 } = {}): this {
		for (let i = 0; i < count; i++) {
			this.t += this.interval;
			this.samples.push({ t: this.t, dx, dy });
		}
		return this;
	}

	/**
	 * Finger stroke from rest over dx/dy px in durationMs. With until < 1 the
	 * fingers lift while still moving; momentum follows unless momentumMs is 0.
	 */
	stroke(dx: number, dy: number, durationMs: number, { until = 1, jitter = 0, seed = 1, decay = 0.95, momentumMs = Infinity } = {}): this {
		const steps = Math.round(durationMs / this.interval);
		const random = seeded(seed);
		let previous = 0;
		for (let i = 1; i <= Math.round(steps * until); i++) {
			const position = minJerk(i / steps);
			const step = (position - previous) * (1 + jitter * (random() * 2 - 1));
			previous = position;
			this.emit(dx * step, dy * step);
		}
		if (until < 1 && momentumMs > 0) {
			const speed = minJerkSpeed(until) / durationMs;
			this.momentum(dx * speed, dy * speed, { decay, durationMs: momentumMs });
		}
		return this;
	}

	/** Inertial scrolling after lifting: velocity in px/ms, decaying by decay per 60 Hz frame */
	momentum(vx: number, vy: number, { decay = 0.95, durationMs = Infinity } = {}): this {
		const factor = Math.pow(decay, this.interval / FRAME_60HZ);
		const end = this.t + durationMs;
		while (Math.hypot(vx, vy) * this.interval >= 0.5 && this.t + this.interval <= end) {
			vx *= factor;
			vy *= factor;
			this.emit(vx * this.interval, vy * this.interval);
		}
		return this;
	}

	pause(ms: number): this {
		this.t += ms;
		return this;
	}

	/** A blocked main thread: the next count events arrive as one, with the last timestamp */
	coalesce(fromIndex: number, count: number): this {
		const merged = this.samples.slice(fromIndex, fromIndex + count);
		this.samples.splice(fromIndex, count, {
			t: merged[merged.length - 1].t,
			dx: merged.reduce((sum, s) => sum + s.dx, 0),
			dy: merged.reduce((sum, s) => sum + s.dy, 0),
		});
		return this;
	}

	private emit(dx: number, dy: number) {
		this.t += this.interval;
		this.carryX += dx;
		this.carryY += dy;
		const x = Math.round(this.carryX);
		const y = Math.round(this.carryY);
		this.carryX -= x;
		this.carryY -= y;
		if (x !== 0 || y !== 0) {
			this.samples.push({ t: this.t, dx: x, dy: y });
		}
	}
}

type LogEntry =
	| { type: 'accept' }
	| { type: 'axis'; axis: string }
	| { type: 'progress'; direction: SwipeDirection | null; progress: number; ready: boolean }
	| { type: 'release'; release: SwipeRelease; t: number }
	| { type: 'end' };

interface Run {
	log: LogEntry[];
	starts: number;
	axes: string[];
	releases: (SwipeRelease & { t: number })[];
	ends: number;
}

interface RunOptions {
	accept?: (start: number) => boolean; // start = index of the gesture
	config?: Partial<RecognizerConfig>;
	tickAt?: { index: number; time: number }; // timer firing before the sample at index
}

function run(gesture: Gesture, { accept = () => true, config = {}, tickAt }: RunOptions = {}): Run {
	const log: LogEntry[] = [];
	let starts = 0;
	let now = 0;
	const recognizer = new GestureRecognizer({
		axis: axis => log.push({ type: 'axis', axis }),
		progress: (direction, progress, ready) => log.push({ type: 'progress', direction, progress, ready }),
		release: release => log.push({ type: 'release', release, t: now }),
		end: () => log.push({ type: 'end' }),
	}, THRESHOLD, config);

	gesture.samples.forEach((sample, index) => {
		if (tickAt?.index === index) {
			recognizer.tick(tickAt.time);
		}
		now = sample.t;
		recognizer.feed(sample, () => {
			log.push({ type: 'accept' });
			return accept(starts++);
		});
	});
	// Let all timeouts expire
	now = gesture.samples[gesture.samples.length - 1].t + 10_000;
	recognizer.tick(now);

	return {
		log,
		starts,
		axes: log.flatMap(entry => entry.type === 'axis' ? [entry.axis] : []),
		releases: log.flatMap(entry => entry.type === 'release' ? [{ ...entry.release, t: entry.t }] : []),
		ends: log.filter(entry => entry.type === 'end').length,
	};
}

function navigations(result: Run): (SwipeDirection | null)[] {
	return result.releases.filter(release => release.navigate).map(release => release.direction);
}

function lastProgress(result: Run) {
	const entries = result.log.filter(entry => entry.type === 'progress');
	return entries[entries.length - 1] as Extract<LogEntry, { type: 'progress' }>;
}

const RATES = [['60 Hz', FRAME_60HZ], ['120 Hz', FRAME_120HZ]] as const;

describe('navigate on release', () => {
	test('a slow, deliberate swipe navigates (F14: no per-event minimum)', () => {
		const result = run(new Gesture().move(-3, 60));
		expect(navigations(result)).toEqual(['back']);
		expect(result.releases[0].reason).toBe('timeout');
	});

	for (const [rate, interval] of RATES) {
		for (const duration of [150, 300, 600, 900]) {
			test(`a ${duration} ms finger stroke that stops before lifting navigates (${rate})`, () => {
				const result = run(new Gesture(interval).stroke(-200, 0, duration));
				expect(navigations(result)).toEqual(['back']);
				expect(result.releases).toHaveLength(1);
			});
		}
	}

	test('a stroke that stays short of the threshold cancels', () => {
		expect(navigations(run(new Gesture().stroke(-120, 0, 300)))).toEqual([]);
	});

	test('a swipe with natural speed variation navigates (120 Hz)', () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			const result = run(new Gesture(FRAME_120HZ).stroke(-400, 0, 600, { jitter: 0.15, seed }));
			expect(navigations(result)).toEqual(['back']);
		}
	});

	test('swiping forward navigates forward', () => {
		expect(navigations(run(new Gesture().stroke(200, 0, 300)))).toEqual(['forward']);
	});

	test('movement before the axis lock counts (F14)', () => {
		const result = run(new Gesture().move(-4, 2).move(-10, 1));
		expect(lastProgress(result).progress).toBeCloseTo(18 / THRESHOLD);
	});
});

describe('momentum (F1)', () => {
	for (const [rate, interval] of RATES) {
		test(`momentum does not push a short swipe over the threshold (${rate})`, () => {
			// 60 px with the fingers, about 240 px of momentum
			const result = run(new Gesture(interval).stroke(-120, 0, 300, { until: 0.5 }));
			expect(navigations(result)).toEqual([]);
			expect(result.releases).toHaveLength(1);
			expect(result.releases[0].reason).toBe('momentum');
			expect(result.releases[0].progress).toBeLessThan(1);
		});

		test(`a swipe past the threshold navigates soon after lifting (${rate})`, () => {
			const gesture = new Gesture(interval).stroke(-300, 0, 300, { until: 0.6, momentumMs: 0 });
			const lift = gesture.t;
			const result = run(gesture.momentum(-300 * minJerkSpeed(0.6) / 300, 0));
			expect(navigations(result)).toEqual(['back']);
			expect(result.releases[0].reason).toBe('momentum');
			expect(result.releases[0].t - lift).toBeLessThanOrEqual(200);
		});

		test(`a slow swipe with momentum does not navigate (${rate})`, () => {
			// About 110 px at lift, 0.19 px/ms
			const result = run(new Gesture(interval).stroke(-130, 0, 900, { until: 0.7 }));
			expect(navigations(result)).toEqual([]);
		});
	}

	test('the rest of the momentum is swallowed: one gesture, one release', () => {
		const result = run(new Gesture().stroke(-300, 0, 300, { until: 0.6 }));
		expect(result.starts).toBe(1);
		expect(result.releases).toHaveLength(1);
		expect(result.ends).toBe(1);
	});

	test('a constant-speed swipe is not mistaken for momentum', () => {
		const result = run(new Gesture().move(-5, 40));
		expect(result.releases).toHaveLength(1);
		expect(result.releases[0].reason).toBe('timeout');
	});
});

describe('flick', () => {
	test('a quick flick navigates although the fingers moved less than the threshold', () => {
		const gesture = new Gesture().stroke(-100, 0, 90, { until: 0.6, momentumMs: 0 });
		const atLift = gesture.samples.reduce((sum, s) => sum + s.dx, 0);
		const result = run(gesture.momentum(-100 * minJerkSpeed(0.6) / 90, 0));
		expect(Math.abs(atLift)).toBeLessThan(THRESHOLD);
		expect(navigations(result)).toEqual(['back']);
	});

	test('a flick navigates below the threshold when the release is detected early', () => {
		// 41 px with the fingers at 1.7 px/ms; a smaller step freezes the swipe sooner
		const result = run(new Gesture().stroke(-60, 0, 60, { until: 0.6 }), { config: { momentumStep: 0.9 } });
		expect(result.releases[0].progress).toBeLessThan(1);
		expect(navigations(result)).toEqual(['back']);
	});

	test('a slow short swipe does not navigate', () => {
		expect(navigations(run(new Gesture().move(-3, 25)))).toEqual([]);
	});

	test('flicking back cancels even while ready', () => {
		const result = run(new Gesture().stroke(-400, 0, 400).stroke(120, 0, 90, { until: 0.6 }));
		expect(result.releases).toHaveLength(1);
		expect(result.releases[0].progress).toBeGreaterThanOrEqual(1);
		expect(navigations(result)).toEqual([]);
	});
});

describe('cancel and hysteresis', () => {
	test('swiping back across the start point cancels', () => {
		const result = run(new Gesture().stroke(-200, 0, 300).stroke(260, 0, 400));
		expect(navigations(result)).toEqual([]);
		expect(result.releases[0].direction).toBe('forward');
	});

	test('slowing down and reversing cancels, without a second navigation', () => {
		const gesture = new Gesture().move(-10, 20);
		for (let d = 9; d >= 1; d--) gesture.move(-d, 1);
		for (let d = 1; d <= 10; d++) gesture.move(d, 1);
		const result = run(gesture.move(10, 20));
		expect(result.starts).toBe(1);
		expect(navigations(result)).toEqual([]);
	});

	for (const [rate, interval] of RATES) {
		// The finger slows down like momentum, so the release is confirmed
		// while it still rests on the trackpad; then it moves back 400 px
		const misdetected = () => new Gesture(interval)
			.stroke(-300, 0, 300, { until: 0.6, momentumMs: 200 })
			.stroke(400, 0, 400);

		test(`a long reversal after a misdetected release does not navigate the other way (F39, ${rate})`, () => {
			const result = run(misdetected());
			// The misdetected release decides on its own, the reversal adds nothing
			expect(result.releases).toHaveLength(1);
			expect(result.releases[0].reason).toBe('momentum');
			expect(result.starts).toBe(1);
			expect(navigations(result)).toEqual(['back']);
		});

		test(`a swipe after that reversal starts at the turning point (F39, ${rate})`, () => {
			// Short of the threshold: carrying the reversal along would make it "forward" and ready
			const result = run(misdetected().stroke(-100, 0, 300));
			expect(result.releases).toHaveLength(2);
			expect(result.releases[1].direction).toBe('back');
			expect(navigations(result)).toEqual(['back']);
		});
	}

	test('a large event across the start point keeps the distance (F27)', () => {
		const result = run(new Gesture().move(-10, 10).move(150, 1));
		expect(lastProgress(result).direction).toBe('forward');
		expect(lastProgress(result).progress).toBeCloseTo(50 / THRESHOLD);
	});

	test('"ready" holds down to 85 % of the threshold', () => {
		const result = run(new Gesture().move(-10, 15).move(10, 1)); // 140 px = 93 %
		expect(lastProgress(result).ready).toBe(true);
		expect(navigations(result)).toEqual(['back']);
	});

	test('below 85 % "ready" is gone and release cancels', () => {
		const result = run(new Gesture().move(-10, 15).move(10, 3)); // 120 px = 80 %
		expect(lastProgress(result).ready).toBe(false);
		expect(navigations(result)).toEqual([]);
	});

	test('"ready" needs the full threshold the first time', () => {
		const result = run(new Gesture().move(-10, 14)); // 140 px
		expect(result.log.some(entry => entry.type === 'progress' && entry.ready)).toBe(false);
	});

	test('the decision always matches the progress shown last', () => {
		const gestures = [
			new Gesture().stroke(-120, 0, 300, { until: 0.5 }),
			new Gesture().stroke(-160, 0, 300, { until: 0.6 }),
			new Gesture().stroke(-300, 0, 300, { until: 0.6 }),
			new Gesture(FRAME_120HZ).stroke(-140, 0, 250, { until: 0.7 }),
			new Gesture().stroke(-200, 0, 600),
		];
		for (const gesture of gestures) {
			const { log } = run(gesture);
			const index = log.findIndex(entry => entry.type === 'release');
			const release = (log[index] as Extract<LogEntry, { type: 'release' }>).release;
			const shown = log.slice(0, index).filter(entry => entry.type === 'progress').pop() as Extract<LogEntry, { type: 'progress' }>;
			expect(release.progress).toBeCloseTo(shown.progress);
			if (shown.ready) {
				expect(release.navigate).toBe(true);
			}
		}
	});
});

describe('pauses (F2)', () => {
	test('holding still mid-swipe does not commit, moving back still cancels', () => {
		const result = run(new Gesture().stroke(-200, 0, 300).pause(300).stroke(200, 0, 300));
		expect(result.starts).toBe(1);
		expect(navigations(result)).toEqual([]);
	});

	test('holding still longer than the fallback commits', () => {
		// The movement after the pause is a new gesture
		const result = run(new Gesture().stroke(-200, 0, 300).pause(500).stroke(50, 0, 200));
		expect(navigations(result)).toEqual(['back']);
		expect(result.releases[0].reason).toBe('timeout');
		expect(result.starts).toBe(2);
	});

	test('zero-delta events neither count nor keep the gesture alive', () => {
		const gesture = new Gesture().move(-10, 20);
		for (let i = 0; i < 6; i++) {
			gesture.pause(100).move(0, 1);
		}
		const result = run(gesture.move(10, 5));
		expect(navigations(result)).toEqual(['back']);
		expect(result.releases[0].reason).toBe('timeout');
		expect(result.starts).toBe(2);
	});
});

describe('axis lock (F15)', () => {
	test('vertical scrolling with horizontal drift never swipes', () => {
		const result = run(new Gesture().move(3, 50, { dy: -10 }));
		expect(result.axes).toEqual(['vertical']);
		expect(result.releases).toEqual([]);
	});

	test('sloppy diagonal scrolling never swipes', () => {
		for (const dx of [-60, -100, 60]) {
			const result = run(new Gesture().stroke(dx, 300, 400, { jitter: 0.2 }).stroke(dx, -300, 400, { until: 0.6 }));
			expect(navigations(result)).toEqual([]);
		}
	});

	test('diagonal movement below the 2:1 ratio counts as vertical', () => {
		const result = run(new Gesture().move(-6, 30, { dy: 4 }));
		expect(result.axes).toEqual(['vertical']);
		expect(result.releases).toEqual([]);
	});

	test('a locked horizontal swipe ignores later vertical movement', () => {
		const result = run(new Gesture().move(-8, 3, { dy: 1 }).move(-2, 10, { dy: 15 }));
		expect(result.axes).toEqual(['horizontal']);
		expect(lastProgress(result).progress).toBeCloseTo(44 / THRESHOLD);
	});
});

describe('gestures and context', () => {
	test('a rejected gesture stays rejected through its momentum', () => {
		const result = run(new Gesture().stroke(-300, 0, 300, { until: 0.6 }), { accept: () => false });
		expect(result.starts).toBe(1);
		expect(result.axes).toEqual([]);
		expect(result.releases).toEqual([]);
		expect(result.ends).toBe(1);
	});

	test('after a pause the next gesture is evaluated again', () => {
		const result = run(
			new Gesture().stroke(-300, 0, 300, { until: 0.6 }).pause(200).stroke(-200, 0, 300),
			{ accept: start => start > 0 },
		);
		expect(result.starts).toBe(2);
		expect(navigations(result)).toEqual(['back']);
	});

	for (const [rate, interval] of RATES) {
		test(`a second swipe during the momentum of the first navigates again (F18, ${rate})`, () => {
			const gesture = new Gesture(interval)
				.stroke(-300, 0, 300, { until: 0.6, momentumMs: 200 }) // fingers touch again after 200 ms
				.stroke(-200, 0, 300);
			const result = run(gesture);
			expect(result.starts).toBe(2);
			expect(navigations(result)).toEqual(['back', 'back']);
		});

		test(`a swipe the other way after the fingers touched again navigates (F40, ${rate})`, () => {
			// Touching stops the momentum, the next swipe follows after a pause (recorded: 43 and
			// 46 ms). Here 45 ms (120 Hz) or 53 ms (60 Hz); without the pause it is the F39 reversal
			const gesture = new Gesture(interval)
				.stroke(-300, 0, 300, { until: 0.6, momentumMs: 200 })
				.pause(20)
				.stroke(400, 0, 400);
			const result = run(gesture);
			expect(result.starts).toBe(2);
			expect(navigations(result)).toEqual(['back', 'forward']);
		});
	}

	test('the old gesture ends before the context check of the new one', () => {
		const { log } = run(new Gesture().stroke(-300, 0, 300, { until: 0.6, momentumMs: 200 }).stroke(-200, 0, 300));
		const types = log.map(entry => entry.type).filter(type => type !== 'progress');
		expect(types).toEqual(['accept', 'axis', 'release', 'end', 'accept', 'axis', 'release', 'end']);
	});

	test('a swipe right after a vertical flick navigates', () => {
		for (const pause of [0, 30, 80]) {
			const result = run(new Gesture()
				.stroke(0, 400, 150, { until: 0.6, momentumMs: 200 })
				.pause(pause)
				.stroke(-200, 0, 300));
			expect(result.axes).toEqual(['vertical', 'horizontal']);
			expect(navigations(result)).toEqual(['back']);
		}
	});

	test('a blocked main thread during momentum does not navigate twice', () => {
		const gesture = new Gesture().stroke(-300, 0, 300, { until: 0.6 });
		const firstMomentum = gesture.samples.findIndex(s => s.t > 1000 + 0.6 * 300);
		const result = run(gesture.coalesce(firstMomentum + 10, 10));
		expect(navigations(result)).toEqual(['back']);
	});

	test('momentum left over after the timer ended the gesture never swipes', () => {
		const gesture = new Gesture().stroke(-300, 0, 300, { until: 0.6 });
		const index = gesture.samples.findIndex(s => s.t > 1000 + 300);
		// The timer fires before events that were queued behind a blocked main thread
		const result = run(gesture, { tickAt: { index, time: gesture.samples[index - 1].t + 200 } });
		expect(navigations(result)).toEqual(['back']);
	});

	test('a gesture navigates at most once', () => {
		const result = run(new Gesture().move(-10, 40).momentum(-0.6, 0).move(-1, 5));
		expect(navigations(result)).toEqual(['back']);
	});

	test('tiny movement that never locks an axis ends after the gap', () => {
		const result = run(new Gesture().move(-2, 2).pause(200).move(-2, 2));
		expect(result.starts).toBe(2);
		expect(result.ends).toBe(2);
		expect(result.axes).toEqual([]);
	});
});

describe('timer', () => {
	test('deadline() and tick() release a resting swipe after the fallback timeout', () => {
		const releases: SwipeRelease[] = [];
		const recognizer = new GestureRecognizer({
			axis: () => {}, progress: () => {}, release: release => releases.push(release), end: () => {},
		}, THRESHOLD);
		const gesture = new Gesture().move(-10, 20);
		gesture.samples.forEach(sample => recognizer.feed(sample, () => true));

		const deadline = recognizer.deadline()!;
		expect(deadline).toBeCloseTo(gesture.t + 400);
		recognizer.tick(deadline - 1);
		expect(releases).toEqual([]);
		recognizer.tick(deadline);
		expect(releases.map(release => release.navigate)).toEqual([true]);
		expect(recognizer.deadline()).toBeNull();
	});
});
