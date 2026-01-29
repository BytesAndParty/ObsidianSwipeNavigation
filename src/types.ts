// === Settings ===

export interface SwipeNavigationSettings {
	sensitivity: number;
	enabled: boolean;
	debugMode: boolean;
}

export const DEFAULT_SETTINGS: SwipeNavigationSettings = {
	sensitivity: 50,
	enabled: true,
	debugMode: false,
};

// === Constants ===

export const SWIPE_COOLDOWN = 300;
export const MIN_DELTA_FOR_LOG = 10;
export const SWIPE_THRESHOLD_MULTIPLIER = 3; // accumulated delta must reach sensitivity * this to trigger
export const MIN_VELOCITY_TO_ACTIVATE = 25; // minimum deltaX in a single event to start swipe (Safari-like)
export const GESTURE_IDLE_TIMEOUT = 200; // ms of no wheel events before gesture is considered ended
export const DECAY_ANIMATION_DURATION = 250; // ms for indicator decay animation
