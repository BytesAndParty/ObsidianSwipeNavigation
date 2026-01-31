// === Settings ===

export type SwipeMode = 'two-finger' | 'three-finger';

export interface SwipeNavigationSettings {
	sensitivity: number;
	enabled: boolean;
	debugMode: boolean;
	swipeMode: SwipeMode;
}

export const DEFAULT_SETTINGS: SwipeNavigationSettings = {
	sensitivity: 50,
	enabled: true,
	debugMode: false,
	swipeMode: 'two-finger', // default to two-finger (works cross-platform)
};

// === Constants ===

// Time between navigations to prevent rapid repeated triggers.
// 300ms matches typical OS gesture debounce intervals.
export const SWIPE_COOLDOWN = 300;

// Minimum deltaX to log a wheel event — filters out noise from
// near-zero movements that would flood the debug console.
export const MIN_DELTA_FOR_LOG = 10;

// Accumulated delta must reach sensitivity × this multiplier to trigger.
// At default sensitivity 50, threshold = 150px accumulated distance.
// Chromium uses ~133%-200% of display width; we use a fixed pixel value
// because Obsidian windows vary in size.
export const SWIPE_THRESHOLD_MULTIPLIER = 3;

// Minimum deltaX in a single wheel event to activate swipe detection.
// Filters out slow horizontal scrolling (e.g. wide tables, graph view).
// 25px per-event is roughly equivalent to a deliberate fast swipe.
// Chromium uses a 2.5:1 direction ratio + 1100px/s fling velocity.
export const MIN_VELOCITY_TO_ACTIVATE = 25;

// Require horizontal movement to dominate vertical by this ratio.
// Chromium uses 2.5:1 to distinguish horizontal swipes from diagonal
// scrolling. Prevents accidental triggers during vertical scroll with
// slight horizontal drift.
export const DIRECTION_RATIO = 2.5;

// ms of no wheel events before gesture is considered ended (finger lifted).
// Safari uses NSEvent phases for this; we approximate via idle timeout.
// 200ms balances responsiveness vs. false positives from trackpad jitter.
export const GESTURE_IDLE_TIMEOUT = 200;

// Duration of the indicator shrink-back animation when gesture ends.
// Matches the CSS transition duration in styles.css.
export const DECAY_ANIMATION_DURATION = 250;
