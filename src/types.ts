// === Settings ===

export interface SwipeNavigationSettings {
	sensitivity: number; // Minimum deltaX threshold to trigger swipe
	enabled: boolean; // Global enable/disable
}

export const DEFAULT_SETTINGS: SwipeNavigationSettings = {
	sensitivity: 50,
	enabled: true,
};

// === Constants ===

export const SWIPE_THRESHOLD = 50; // Minimum horizontal scroll to detect swipe
export const SWIPE_COOLDOWN = 300; // Milliseconds between swipes to prevent double-triggers
