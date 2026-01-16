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
