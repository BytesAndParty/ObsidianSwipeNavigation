// === Settings ===

export interface SwipeNavigationSettings {
	enabled: boolean;
	sensitivity: number;
	invertDirection: boolean;
	disabledViewTypes: string[];
	debugMode: boolean;
}

export const DEFAULT_SETTINGS: SwipeNavigationSettings = {
	enabled: true,
	sensitivity: 50,
	// Swap back/forward, e.g. for macOS with natural scrolling turned off.
	// Chromium does not expose whether deltas are inverted from the device.
	invertDirection: false,
	// Views that pan with horizontal wheel input themselves
	disabledViewTypes: ['canvas', 'graph', 'localgraph', 'excalidraw'],
	debugMode: false,
};

// === Constants ===

// Minimum deltaX to log a wheel event — filters out noise from
// near-zero movements that would flood the debug console.
export const MIN_DELTA_FOR_LOG = 10;

// Swipe distance must reach sensitivity × this multiplier to trigger.
// Gesture timing and momentum parameters live in GestureRecognizer.ts.
// At default sensitivity 50, threshold = 150px accumulated distance.
// Chromium uses ~133%-200% of display width; we use a fixed pixel value
// because Obsidian windows vary in size.
export const SWIPE_THRESHOLD_MULTIPLIER = 3;

// Duration of the indicator shrink-back animation when gesture ends.
// Matches the CSS transition duration in styles.css.
export const DECAY_ANIMATION_DURATION = 250;
