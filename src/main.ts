import { Plugin } from 'obsidian';
import { SwipeNavigationSettings, DEFAULT_SETTINGS, SWIPE_COOLDOWN } from './types';
import { SwipeNavigationSettingsTab } from './SettingsTab';

export default class SwipeNavigationPlugin extends Plugin {
	settings: SwipeNavigationSettings;
	private lastSwipeTime: number = 0;
	private abortController: AbortController;

	async onload() {
		await this.loadSettings();

		// Register settings tab
		this.addSettingTab(new SwipeNavigationSettingsTab(this.app, this));

		// Setup trackpad gesture listener
		this.setupSwipeListener();

		console.log('[SwipeNavigation] Plugin loaded');
	}

	onunload() {
		// Clean up event listeners
		if (this.abortController) {
			this.abortController.abort();
		}
		console.log('[SwipeNavigation] Plugin unloaded');
	}

	/**
	 * Sets up the wheel event listener for trackpad swipe detection
	 */
	private setupSwipeListener() {
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		// Listen to wheel events on the document
		document.addEventListener('wheel', (event: WheelEvent) => {
			this.handleWheelEvent(event);
		}, { signal, passive: true });
	}

	/**
	 * Handles wheel events and detects horizontal swipe gestures
	 */
	private handleWheelEvent(event: WheelEvent) {
		// Skip if plugin is disabled
		if (!this.settings.enabled) {
			return;
		}

		// Only process horizontal swipes (deltaX)
		const horizontalDelta = event.deltaX;
		const verticalDelta = Math.abs(event.deltaY);

		// Debug logging (can be removed after testing)
		if (Math.abs(horizontalDelta) > 10 || verticalDelta > 10) {
			console.log('[SwipeNavigation] Wheel event:', {
				deltaX: horizontalDelta.toFixed(2),
				deltaY: event.deltaY.toFixed(2),
				threshold: this.settings.sensitivity,
				enabled: this.settings.enabled
			});
		}

		// Ignore if vertical scrolling is dominant
		if (verticalDelta > Math.abs(horizontalDelta)) {
			return;
		}

		// Check if swipe exceeds sensitivity threshold
		const threshold = this.settings.sensitivity;

		// Swipe left (navigate back)
		if (horizontalDelta < -threshold) {
			this.navigateBack();
		}
		// Swipe right (navigate forward)
		else if (horizontalDelta > threshold) {
			this.navigateForward();
		}
	}

	/**
	 * Navigate to previous location in history
	 */
	private navigateBack() {
		// Cooldown check to prevent double-triggers
		const now = Date.now();
		if (now - this.lastSwipeTime < SWIPE_COOLDOWN) {
			console.log('[SwipeNavigation] Navigate back blocked by cooldown');
			return;
		}
		this.lastSwipeTime = now;

		console.log('[SwipeNavigation] Navigating BACK');
		// Execute Obsidian's native "Navigate back" command
		// @ts-ignore - app.commands exists but not in type definitions
		this.app.commands.executeCommandById('app:go-back');
	}

	/**
	 * Navigate to next location in history
	 */
	private navigateForward() {
		// Cooldown check to prevent double-triggers
		const now = Date.now();
		if (now - this.lastSwipeTime < SWIPE_COOLDOWN) {
			console.log('[SwipeNavigation] Navigate forward blocked by cooldown');
			return;
		}
		this.lastSwipeTime = now;

		console.log('[SwipeNavigation] Navigating FORWARD');
		// Execute Obsidian's native "Navigate forward" command
		// @ts-ignore - app.commands exists but not in type definitions
		this.app.commands.executeCommandById('app:go-forward');
	}

	// === Settings Management ===

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
