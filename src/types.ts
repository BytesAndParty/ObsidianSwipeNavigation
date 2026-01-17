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
