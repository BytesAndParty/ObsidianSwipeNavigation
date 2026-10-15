// === Gesture Recognizer ===
// Turns wheel samples into swipe progress and, on release, a decision to
// navigate or cancel. Pure logic without DOM or 'obsidian' imports, so
// bun test can drive it with synthetic gestures and recorded traces.
//
// Wheel events cannot tell "finger resting", "finger lifted" and momentum
// apart, so the release is inferred. Momentum slows down at a steady rate:
// every 20 % of speed it loses takes the same time. A finger that stops
// loses speed faster and faster. When the speed has dropped by one step
// after its peak, the swipe freezes and the release is pending; if the next
// step takes about as long, it was momentum and the frozen state decides.
// Otherwise the finger is still down and the swipe resumes. A long pause is
// the fallback.

export type SwipeDirection = 'back' | 'forward';
export type GestureAxis = 'horizontal' | 'vertical';
export type GesturePhase = 'idle' | 'tracking' | 'swiping' | 'releasing' | 'rejected' | 'settling';
export type ReleaseReason = 'momentum' | 'timeout';

export interface WheelSample {
	t: number;  // ms
	dx: number; // negative = towards "back" (already reversed if the user swapped directions)
	dy: number;
}

export interface SwipeRelease {
	reason: ReleaseReason;
	direction: SwipeDirection | null; // side of the start point at release
	navigate: boolean;
	progress: number;
	velocity: number; // px/ms towards direction, negative = moving back to the start
}

export interface GestureHandler {
	/** The axis was decided; a vertical gesture never swipes. */
	axis(axis: GestureAxis): void;
	/** Swipe progress = distance from the start point / threshold, not clamped. Not called while the release is pending. */
	progress(direction: SwipeDirection | null, progress: number, ready: boolean): void;
	/** The swipe was released: navigate or cancel, decided on the progress shown last. At most once per gesture. */
	release(release: SwipeRelease): void;
	/** The gesture is over, including its momentum. */
	end(): void;
}

// Decay rates are given per 60 Hz frame (1000 / 60 ms), independent of the actual refresh rate
const FRAME_MS = 1000 / 60;

// All values are provisional until tuned with recorded traces (PLAN.md, Phase 2)
export const RECOGNIZER_DEFAULTS = {
	axisLockDistance: 12,         // px of movement before the axis is decided
	axisLockRatio: 2,             // horizontal if |Σdx| ≥ ratio × |Σdy|
	readyHoldRatio: 0.85,         // once ready, stay ready down to this progress
	velocityWindowMs: 50,
	// A gesture must speed up beyond onsetFactor × its first event's speed
	// (delta / time since the previous event) before it can swipe. Fingers
	// start from rest; leftover or coalesced momentum never speeds up.
	onsetFactor: 1.2,
	// Release by momentum
	momentumMinSpeed: 0.12,       // px/ms at the peak; slower releases are left to the timeout
	momentumStep: 0.8,            // speed ratio of one step: peak → pending → confirmed
	momentumMinRate: 0.8,         // per-frame speed ratio during the first step
	momentumMaxRate: 0.98,
	momentumMinStepTime: 0.85,    // the second step takes at least this share of the first one's time (linear slow-down: 0.8)
	momentumMaxStepTime: 2,       // and at most this share; momentum does not stall
	reaccelerationRatio: 1.25,    // faster than this × the lowest speed since the peak = finger moving again
	reaccelerationMinSpeed: 0.05, // px/ms added to that
	// Decision
	flickMinProgress: 0.4,        // a flick navigates from this progress on
	flickVelocity: 1.5,           // px/ms
	releaseTimeoutMs: 400,        // fallback release when no momentum follows
	gestureGapMs: 150,            // pause that ends a gesture outside of swiping
	// Vertical scrolling that slows down or pauses gives way to a horizontal swipe
	restartMinDelta: 2,           // px
	restartPauseMs: 50,
	restartDecay: 0.5,            // vertical speed at most this share of its peak
};

export type RecognizerConfig = typeof RECOGNIZER_DEFAULTS;

interface SpeedPoint {
	t: number;
	speed: number;    // px/ms, absolute
	velocity: number; // px/ms, positive = towards "forward"
}

// Swipe state shown when the release became pending; the decision uses exactly this
interface FrozenSwipe extends SpeedPoint {
	offset: number;
	ready: boolean;
}

export class GestureRecognizer {
	threshold: number; // px from the start point to "ready"

	private readonly handler: GestureHandler;
	private readonly config: RecognizerConfig;

	private state: GesturePhase = 'idle';
	private lastTime: number = -Infinity; // previous sample, across gestures
	private sumX: number = 0; // also the swipe offset, counted from the first event
	private sumY: number = 0;
	private ready: boolean = false;
	private readyDirection: SwipeDirection | null = null;
	private recent: WheelSample[] = [];
	private lockedAxis: GestureAxis | null = null;
	private onsetSpeed: number = 0;
	private accelerated: boolean = false;
	private strokeVelocity: number = 0; // fastest since the last change of direction, for flicks

	// Release detection while swiping
	private previous: SpeedPoint | null = null; // last sample, to interpolate step times
	private peak: SpeedPoint | null = null;
	private minSpeed: number = 0; // lowest speed since the peak
	private frozen: FrozenSwipe | null = null;

	// Momentum after the release (settling)
	private trailSign: number = 0;
	private trailSpeed: number = 0;
	private trailMin: number = 0;
	private trailRising: number = 0;
	private trailSinceMin: number = 0; // movement since the lowest speed, carried into a new gesture

	// Vertical scrolling (rejected by the axis lock)
	private peakVerticalSpeed: number = 0;

	constructor(handler: GestureHandler, threshold: number, config: Partial<RecognizerConfig> = {}) {
		this.handler = handler;
		this.threshold = threshold;
		this.config = { ...RECOGNIZER_DEFAULTS, ...config };
	}

	get phase(): GesturePhase {
		return this.state;
	}

	/**
	 * Process one wheel event. accept() is called once for the first event of
	 * every gesture and decides whether the gesture may navigate at all.
	 */
	feed(sample: WheelSample, accept: () => boolean) {
		// Chromium drops the phase-ended event on macOS; Windows may send (0,0) at fling begin (PLAN.md)
		if (sample.dx === 0 && sample.dy === 0) {
			return;
		}
		const interval = sample.t - this.lastTime;

		// Pauses since the previous event, in case the timer has not fired yet
		this.tick(sample.t);

		if (this.state !== 'idle') {
			this.recordVelocity(sample);
		}
		if (this.state === 'settling') {
			this.followTrail(sample);
			if (this.trailReaccelerates()) {
				// Fingers back on the trackpad: a new swipe, including its start
				const carry = this.trailSinceMin - sample.dx;
				this.endGesture();
				this.startGesture(accept(), sample, interval, { carry, accelerated: true });
			}
		} else if (this.state === 'rejected' && this.verticalGivesWay(sample, interval)) {
			this.endGesture();
			this.startGesture(accept(), sample, interval);
		}
		if (this.state === 'idle') {
			this.startGesture(accept(), sample, interval);
		}
		this.lastTime = Math.max(sample.t, this.lastTime);

		switch (this.state) {
			case 'tracking':
				this.track(sample);
				break;
			case 'swiping':
				this.sumX += sample.dx;
				this.updateProgress();
				this.watchRelease(sample);
				break;
			case 'releasing':
				this.sumX += sample.dx;
				this.confirmRelease(sample);
				break;
			case 'rejected':
				if (this.lockedAxis === 'vertical') {
					this.peakVerticalSpeed = Math.max(this.peakVerticalSpeed, Math.abs(this.velocity('dy')));
				}
				break;
		}
	}

	/** Apply pauses up to now: release fallback while swiping, otherwise end of gesture. */
	tick(now: number) {
		if (this.state === 'idle') {
			return;
		}
		const idle = now - this.lastTime;
		if (this.state === 'swiping' || this.state === 'releasing') {
			if (idle >= this.config.releaseTimeoutMs) {
				// Events stopped instead of trickling out: the finger stopped, so it was no momentum
				if (this.state === 'releasing') {
					this.updateProgress();
				}
				// The fingers rested before lifting, so no flick
				this.release('timeout', this.sumX, this.ready, 0);
				this.endGesture();
			}
		} else if (idle >= this.config.gestureGapMs) {
			this.endGesture();
		}
	}

	/** Time at which tick() has something to do, or null while idle. */
	deadline(): number | null {
		switch (this.state) {
			case 'idle':
				return null;
			case 'swiping':
			case 'releasing':
				return this.lastTime + this.config.releaseTimeoutMs;
			default:
				return this.lastTime + this.config.gestureGapMs;
		}
	}

	// === Gesture Lifecycle ===

	private startGesture(accepted: boolean, sample: WheelSample, interval: number, { carry = 0, accelerated = false } = {}) {
		this.state = accepted ? 'tracking' : 'rejected';
		this.sumX = carry;
		this.sumY = 0;
		this.ready = false;
		this.readyDirection = null;
		this.recent = [sample];
		this.lockedAxis = null;
		this.onsetSpeed = Math.abs(sample.dx) / interval;
		this.accelerated = accelerated;
		this.strokeVelocity = 0;
		this.previous = null;
		this.peak = null;
		this.minSpeed = 0;
		this.frozen = null;
		this.peakVerticalSpeed = 0;
	}

	private endGesture() {
		this.state = 'idle';
		this.handler.end();
	}

	/** Collect movement until the axis can be decided, then lock it for the whole gesture. */
	private track(sample: WheelSample) {
		this.sumX += sample.dx;
		this.sumY += sample.dy;
		this.observeStroke(this.velocity('dx'));
		if (!this.accelerated && Math.abs(this.velocity('dx')) > this.onsetSpeed * this.config.onsetFactor) {
			this.accelerated = true;
		}

		if (Math.hypot(this.sumX, this.sumY) < this.config.axisLockDistance) {
			return;
		}
		if (Math.abs(this.sumX) >= this.config.axisLockRatio * Math.abs(this.sumY)) {
			// Leftover momentum never speeds up and ends with the next pause
			if (!this.accelerated) {
				return;
			}
			this.state = 'swiping';
			this.lockedAxis = 'horizontal';
			this.handler.axis('horizontal');
			this.updateProgress();
			this.watchRelease(sample);
		} else {
			this.state = 'rejected';
			this.lockedAxis = 'vertical';
			this.peakVerticalSpeed = Math.abs(this.velocity('dy'));
			this.handler.axis('vertical');
		}
	}

	private updateProgress() {
		const direction = directionOf(this.sumX);
		const progress = Math.abs(this.sumX) / this.threshold;

		// "Ready" belongs to one side of the start point, with hysteresis against flicker
		if (direction !== this.readyDirection) {
			this.ready = false;
			this.readyDirection = direction;
		}
		this.ready = progress >= (this.ready ? this.config.readyHoldRatio : 1);

		this.handler.progress(direction, progress, this.ready);
	}

	// === Release ===

	/** Track the speed peak; one step of steady decay after it freezes the swipe as a pending release. */
	private watchRelease(sample: WheelSample) {
		const velocity = this.velocity('dx');
		const point = { t: sample.t, speed: Math.abs(velocity), velocity };
		const previous = this.previous;
		const peak = this.peak;
		this.previous = point;
		this.observeStroke(velocity);

		if (!peak || Math.sign(velocity) !== Math.sign(peak.velocity) || point.speed >= peak.speed || this.reaccelerates(point.speed)) {
			this.peak = point;
			this.minSpeed = point.speed;
			return;
		}
		this.minSpeed = Math.min(this.minSpeed, point.speed);

		const target = peak.speed * this.config.momentumStep;
		if (peak.speed < this.config.momentumMinSpeed || point.speed > target) {
			return;
		}
		const reached = crossingTime(previous ?? peak, point, target);
		const rate = decayRate(this.config.momentumStep, reached - peak.t);
		if (rate >= this.config.momentumMinRate && rate <= this.config.momentumMaxRate) {
			this.frozen = { t: reached, speed: target, velocity, offset: this.sumX, ready: this.ready };
			this.state = 'releasing';
		} else {
			// Too abrupt or too slow for momentum: judge further decay from here
			this.peak = point;
			this.minSpeed = point.speed;
		}
	}

	/**
	 * Momentum takes as long for the next step as for the first; a finger that
	 * stops is faster, one that moves on is slower or speeds up again.
	 */
	private confirmRelease(sample: WheelSample) {
		const frozen = this.frozen!;
		const peak = this.peak!;
		const velocity = this.velocity('dx');
		const point = { t: sample.t, speed: Math.abs(velocity), velocity };
		const previous = this.previous!;
		this.previous = point;
		this.observeStroke(velocity);

		const reversed = Math.abs(sample.dx) >= 1 && Math.sign(sample.dx) === -Math.sign(peak.velocity);
		if (reversed || this.reaccelerates(point.speed)) {
			this.resumeSwipe(point);
			return;
		}
		this.minSpeed = Math.min(this.minSpeed, point.speed);

		const firstStep = frozen.t - peak.t;
		const target = frozen.speed * this.config.momentumStep;
		if (point.speed > target) {
			if (sample.t - frozen.t > firstStep * this.config.momentumMaxStepTime) {
				this.resumeSwipe(point);
			}
			return;
		}
		const secondStep = crossingTime(previous, point, target) - frozen.t;
		if (secondStep >= firstStep * this.config.momentumMinStepTime) {
			this.release('momentum', frozen.offset, frozen.ready, this.strokeVelocity);
			this.startTrail(velocity);
		} else {
			this.resumeSwipe(point);
		}
	}

	private resumeSwipe(point: SpeedPoint) {
		this.state = 'swiping';
		this.frozen = null;
		this.peak = point;
		this.minSpeed = point.speed;
		this.updateProgress();
	}

	/** Fastest velocity since the last change of direction: the flick at release */
	private observeStroke(velocity: number) {
		if (Math.sign(velocity) !== Math.sign(this.strokeVelocity) || Math.abs(velocity) > Math.abs(this.strokeVelocity)) {
			this.strokeVelocity = velocity;
		}
	}

	private reaccelerates(speed: number): boolean {
		return speed > this.minSpeed * this.config.reaccelerationRatio + this.config.reaccelerationMinSpeed;
	}

	/** Navigate when "ready" or on a quick flick; flicking back always cancels. */
	private release(reason: ReleaseReason, offset: number, ready: boolean, rawVelocity: number) {
		const direction = directionOf(offset);
		const progress = Math.abs(offset) / this.threshold;
		const velocity = direction === 'back' ? -rawVelocity : direction === 'forward' ? rawVelocity : 0;

		const flick = progress >= this.config.flickMinProgress && velocity >= this.config.flickVelocity;
		const flickedBack = velocity <= -this.config.flickVelocity;
		const navigate = direction !== null && !flickedBack && (ready || flick);

		this.handler.release({ reason, direction, navigate, progress, velocity });
	}

	// === After the Release ===

	private startTrail(velocity: number) {
		this.state = 'settling';
		this.trailSign = Math.sign(velocity);
		this.trailSpeed = Math.abs(velocity);
		this.trailMin = this.trailSpeed;
		this.trailRising = 0;
		this.trailSinceMin = 0;
	}

	/** Speed along the momentum; it only ever decreases until the fingers touch again. */
	private followTrail(sample: WheelSample) {
		const speed = this.velocity('dx') * this.trailSign;
		this.trailRising = speed > this.trailSpeed ? this.trailRising + 1 : 0;
		this.trailSpeed = speed;
		if (speed < this.trailMin) {
			this.trailMin = speed;
			this.trailSinceMin = 0;
		} else {
			this.trailSinceMin += sample.dx;
		}
	}

	/** Two rises in a row, clearly above the slowest momentum. A single jump (coalesced events) is not enough. */
	private trailReaccelerates(): boolean {
		return this.trailRising >= 2
			&& this.trailSpeed > this.trailMin * this.config.reaccelerationRatio + this.config.reaccelerationMinSpeed;
	}

	/**
	 * Vertical scrolling stays latched while the finger scrolls, but a clearly
	 * horizontal event after it slowed down or paused starts a new gesture.
	 */
	private verticalGivesWay(sample: WheelSample, interval: number): boolean {
		if (this.lockedAxis !== 'vertical') {
			return false;
		}
		const horizontal = Math.abs(sample.dx) >= this.config.restartMinDelta
			&& Math.abs(sample.dx) >= this.config.axisLockRatio * Math.abs(sample.dy);
		if (!horizontal) {
			return false;
		}
		return interval >= this.config.restartPauseMs
			|| Math.abs(this.velocity('dy')) <= this.peakVerticalSpeed * this.config.restartDecay;
	}

	// === Velocity ===

	private recordVelocity(sample: WheelSample) {
		this.recent.push(sample);
		const windowStart = sample.t - this.config.velocityWindowMs;
		while (this.recent.length > 2 && this.recent[0].t < windowStart) {
			this.recent.shift();
		}
	}

	/** px/ms over the recent window, positive = towards "forward" (dx) or down (dy) */
	private velocity(axis: 'dx' | 'dy'): number {
		if (this.recent.length < 2) {
			return 0;
		}
		const elapsed = this.recent[this.recent.length - 1].t - this.recent[0].t;
		if (elapsed <= 0) {
			return 0;
		}
		// The first sample only marks the start of the window
		let distance = 0;
		for (let i = 1; i < this.recent.length; i++) {
			distance += this.recent[i][axis];
		}
		return distance / elapsed;
	}
}

function directionOf(offset: number): SwipeDirection | null {
	return offset < 0 ? 'back' : offset > 0 ? 'forward' : null;
}

/** When the speed passed target between two samples, interpolated linearly */
function crossingTime(before: SpeedPoint, after: SpeedPoint, target: number): number {
	if (before.speed <= target || before.speed === after.speed) {
		return after.t;
	}
	return before.t + (before.speed - target) / (before.speed - after.speed) * (after.t - before.t);
}

/** Speed ratio over elapsed ms, expressed per 60 Hz frame */
function decayRate(ratio: number, elapsed: number): number {
	return Math.pow(ratio, FRAME_MS / elapsed);
}
