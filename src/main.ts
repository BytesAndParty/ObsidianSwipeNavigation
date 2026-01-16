import { Notice, Plugin } from 'obsidian';
import { SwipeNavigationSettings, DEFAULT_SETTINGS, SWIPE_COOLDOWN, MIN_DELTA_FOR_LOG } from './types';
import { SwipeNavigationSettingsTab } from './SettingsTab';

// === Type Declarations for Obsidian Internal API ===

declare module 'obsidian' {
	interface App {
		commands: {
			executeCommandById(id: string): boolean;
		};
	}
}

// === Constants ===

type NavigationDirection = 'back' | 'forward';

const NAVIGATION_COMMANDS: Record<NavigationDirection, string> = {
	back: 'app:go-back',
	forward: 'app:go-forward',
};

// === Plugin ===

export default class SwipeNavigationPlugin extends Plugin {
	settings: SwipeNavigationSettings;
	private lastSwipeTime: number = 0;
	private abortController: AbortController | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SwipeNavigationSettingsTab(this.app, this));

		this.setupSwipeListener();

		this.log('Plugin loaded');
	}

	onunload() {
		this.abortController?.abort();
		this.abortController = null;
		this.log('Plugin unloaded');
	}

	// === Swipe Detection ===

	private setupSwipeListener() {
		// Defensive cleanup of existing listener
		this.abortController?.abort();

		this.abortController = new AbortController();
		const { signal } = this.abortController;

		document.addEventListener('wheel', (event: WheelEvent) => {
			this.handleWheelEvent(event);
		}, { signal, passive: true });
	}

	private handleWheelEvent(event: WheelEvent) {
		if (!this.settings.enabled) {
			return;
		}

		const horizontalDelta = event.deltaX;
		const verticalDelta = Math.abs(event.deltaY);

		// Debug logging (only when debugMode is enabled)
		if (this.settings.debugMode && (Math.abs(horizontalDelta) > MIN_DELTA_FOR_LOG || verticalDelta > MIN_DELTA_FOR_LOG)) {
			this.log('Wheel event:', {
				deltaX: horizontalDelta.toFixed(2),
				deltaY: event.deltaY.toFixed(2),
				threshold: this.settings.sensitivity,
			});
		}

		// Ignore if vertical scrolling is dominant
		if (verticalDelta > Math.abs(horizontalDelta)) {
			return;
		}

		const threshold = this.settings.sensitivity;

		if (horizontalDelta < -threshold) {
			this.navigate('back');
		} else if (horizontalDelta > threshold) {
			this.navigate('forward');
		}
	}

	// === Navigation ===

	private navigate(direction: NavigationDirection) {
		if (!this.checkCooldown(direction)) {
			return;
		}

		this.lastSwipeTime = Date.now();

		const command = NAVIGATION_COMMANDS[direction];
		const success = this.app.commands.executeCommandById(command);

		if (success) {
			if (this.settings.debugMode) {
				this.log(`Navigating ${direction.toUpperCase()}`);
			}
		} else {
			this.logWarn(`Navigation ${direction} failed - command not found`);
			new Notice(`Swipe Navigation: Could not navigate ${direction}`);
		}
	}

	private checkCooldown(direction: NavigationDirection): boolean {
		const now = Date.now();
		const timeSinceLastSwipe = now - this.lastSwipeTime;

		if (timeSinceLastSwipe < SWIPE_COOLDOWN) {
			if (this.settings.debugMode) {
				this.log(`Navigate ${direction} blocked by cooldown (${timeSinceLastSwipe}ms < ${SWIPE_COOLDOWN}ms)`);
			}
			return false;
		}

		return true;
	}

	// === Utilities ===

	private log(message: string, data?: unknown) {
		console.log('[SwipeNavigation]', message, data ?? '');
	}

	private logWarn(message: string, data?: unknown) {
		console.warn('[SwipeNavigation]', message, data ?? '');
	}

	// === Settings Management ===

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
