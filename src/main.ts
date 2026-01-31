import { Notice, Plugin } from 'obsidian';
import {
	SwipeNavigationSettings, DEFAULT_SETTINGS, SWIPE_COOLDOWN,
	MIN_DELTA_FOR_LOG, SWIPE_THRESHOLD_MULTIPLIER, MIN_VELOCITY_TO_ACTIVATE,
	DIRECTION_RATIO, GESTURE_IDLE_TIMEOUT, DECAY_ANIMATION_DURATION
} from './types';
import { SwipeNavigationSettingsTab } from './SettingsTab';

// === Type Declarations for Obsidian Internal API ===

interface LeafHistory {
	backHistory: unknown[];
	forwardHistory: unknown[];
}

declare module 'obsidian' {
	interface App {
		commands: {
			executeCommandById(id: string): boolean;
		};
	}
	interface WorkspaceLeaf {
		history: LeafHistory;
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

	// Two-finger swipe state
	private abortController: AbortController | null = null;
	private accumulatedDelta: number = 0;
	private currentDirection: NavigationDirection | null = null;
	private swipeActive: boolean = false;
	private thresholdReached: boolean = false;
	private navigationLocked: boolean = false; // Blocks all input until gesture fully ends
	private gestureIdleTimer: ReturnType<typeof setTimeout> | null = null;

	// Three-finger swipe state (macOS only, via Electron BrowserWindow)
	private electronWindow: any = null;
	private swipeHandler: ((_event: unknown, direction: string) => void) | null = null;

	// Visual indicator elements
	private indicatorLeft: HTMLElement | null = null;
	private indicatorRight: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SwipeNavigationSettingsTab(this.app, this));

		this.createIndicators();
		this.setupSwipeListener();

		this.log('Plugin loaded');
	}

	onunload() {
		this.teardownListeners();
		this.clearGestureIdleTimer();
		this.removeIndicators();
		this.log('Plugin unloaded');
	}

	// === Visual Indicators ===

	private createIndicators() {
		// Left indicator (for "back" navigation)
		this.indicatorLeft = document.body.createDiv({
			cls: 'swipe-nav-indicator swipe-nav-indicator-left',
		});
		this.indicatorLeft.createDiv({ cls: 'swipe-nav-indicator-arrow' });

		// Right indicator (for "forward" navigation)
		this.indicatorRight = document.body.createDiv({
			cls: 'swipe-nav-indicator swipe-nav-indicator-right',
		});
		this.indicatorRight.createDiv({ cls: 'swipe-nav-indicator-arrow' });
	}

	private removeIndicators() {
		this.indicatorLeft?.remove();
		this.indicatorRight?.remove();
		this.indicatorLeft = null;
		this.indicatorRight = null;
	}

	private updateIndicator(direction: NavigationDirection, progress: number) {
		const indicator = direction === 'back' ? this.indicatorLeft : this.indicatorRight;
		if (!indicator) return;

		const clampedProgress = Math.min(Math.max(progress, 0), 1);
		const width = clampedProgress * 60; // max 60px width

		indicator.style.width = `${width}px`;
		indicator.style.opacity = `${clampedProgress}`;

		// Show arrow when threshold is reached
		const arrow = indicator.querySelector('.swipe-nav-indicator-arrow') as HTMLElement;
		if (arrow) {
			arrow.style.opacity = clampedProgress >= 1 ? '1' : '0';
		}

		indicator.classList.toggle('ready', clampedProgress >= 1);
	}

	private resetIndicators() {
		if (this.indicatorLeft) {
			this.indicatorLeft.style.width = '0';
			this.indicatorLeft.style.opacity = '0';
			this.indicatorLeft.classList.remove('ready');
		}
		if (this.indicatorRight) {
			this.indicatorRight.style.width = '0';
			this.indicatorRight.style.opacity = '0';
			this.indicatorRight.classList.remove('ready');
		}
	}

	private animateIndicatorReset() {
		// Add transition class for smooth animation
		this.indicatorLeft?.classList.add('animating');
		this.indicatorRight?.classList.add('animating');

		this.resetIndicators();

		// Remove transition class after animation completes
		setTimeout(() => {
			this.indicatorLeft?.classList.remove('animating');
			this.indicatorRight?.classList.remove('animating');
		}, DECAY_ANIMATION_DURATION);
	}

	/**
	 * Brief flash of the indicator for discrete gestures (three-finger swipe)
	 * where there is no progressive feedback.
	 */
	private flashIndicator(direction: NavigationDirection) {
		this.updateIndicator(direction, 1);
		this.animateIndicatorReset();
	}

	// === Swipe Listener Setup ===

	/**
	 * Initialize the appropriate swipe listener based on the current swipeMode setting.
	 * Called on load and when the setting changes.
	 */
	setupSwipeListener() {
		this.teardownListeners();

		if (this.settings.swipeMode === 'three-finger') {
			const success = this.setupThreeFingerSwipe();
			if (!success) {
				this.logWarn('Three-finger swipe not available, falling back to two-finger mode');
				this.setupTwoFingerSwipe();
			}
		} else {
			this.setupTwoFingerSwipe();
		}
	}

	private teardownListeners() {
		// Clean up two-finger listener
		this.abortController?.abort();
		this.abortController = null;
		this.resetSwipeState();

		// Clean up three-finger listener
		this.removeThreeFingerSwipe();
	}

	// === Three-Finger Swipe (macOS only) ===

	/**
	 * Set up three-finger swipe via Electron's BrowserWindow 'swipe' event.
	 * This is a macOS-only feature that fires for three-finger swipes when
	 * the system preference "Swipe between pages" is set to "Swipe with
	 * three fingers" or "Swipe with two or three fingers".
	 *
	 * Returns true if setup succeeded, false if Electron API is not available.
	 */
	private setupThreeFingerSwipe(): boolean {
		try {
			// @ts-ignore — Electron internal API, not in Obsidian's type definitions.
			// Obsidian uses @electron/remote to expose main-process modules to the renderer.
			const { remote } = require('electron');
			const win = remote?.getCurrentWindow?.();

			if (!win) {
				this.logWarn('Three-finger swipe: Could not access BrowserWindow');
				return false;
			}

			this.swipeHandler = (_event: unknown, direction: string) => {
				if (!this.settings.enabled) return;

				if (this.settings.debugMode) {
					this.log('Three-finger swipe:', { direction });
				}

				// Electron's 'swipe' event uses 'left'/'right' for direction.
				// 'left' means swipe-left = navigate back, 'right' = navigate forward.
				if (direction === 'left') {
					this.flashIndicator('back');
					this.navigate('back');
				} else if (direction === 'right') {
					this.flashIndicator('forward');
					this.navigate('forward');
				}
			};

			win.on('swipe', this.swipeHandler);
			this.electronWindow = win;
			this.log('Three-finger swipe listener active');
			return true;
		} catch (e) {
			this.logWarn('Three-finger swipe not available (Electron API inaccessible)', e);
			return false;
		}
	}

	private removeThreeFingerSwipe() {
		if (this.electronWindow && this.swipeHandler) {
			this.electronWindow.removeListener('swipe', this.swipeHandler);
			this.electronWindow = null;
			this.swipeHandler = null;
		}
	}

	// === Two-Finger Swipe Detection ===

	private setupTwoFingerSwipe() {
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		document.addEventListener('wheel', (event: WheelEvent) => {
			this.handleWheelEvent(event);
		}, { signal, passive: true });

		this.log('Two-finger swipe listener active');
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
				accumulated: this.accumulatedDelta.toFixed(2),
				active: this.swipeActive,
				ready: this.thresholdReached,
			});
		}

		// Require horizontal movement to dominate vertical by DIRECTION_RATIO (2.5:1).
		// Chromium uses this ratio to distinguish intentional horizontal swipes from
		// diagonal scrolling. A simple `>` comparison was too permissive.
		if (verticalDelta * DIRECTION_RATIO > Math.abs(horizontalDelta)) {
			return;
		}

		// Ignore very small movements (sub-pixel noise from trackpad)
		if (Math.abs(horizontalDelta) < 1) {
			return;
		}

		// Reset the idle timer on every wheel event (gesture is still active)
		this.resetGestureIdleTimer();

		// After a navigation fires, block all further input until the gesture
		// fully ends (idle timeout = finger lifted). This prevents a single
		// long/fast swipe from triggering multiple navigations.
		if (this.navigationLocked) {
			return;
		}

		// Check velocity threshold to activate swipe gesture.
		// Only activate if this is a fast swipe, not slow horizontal scrolling.
		// MIN_VELOCITY_TO_ACTIVATE (25px) per single event filters out gentle
		// horizontal panning (e.g. in graph view or wide tables).
		if (!this.swipeActive) {
			if (Math.abs(horizontalDelta) >= MIN_VELOCITY_TO_ACTIVATE) {
				this.swipeActive = true;
				if (this.settings.debugMode) {
					this.log('Swipe activated (velocity threshold met)');
				}
			} else {
				return;
			}
		}

		// Accumulate the delta
		this.accumulatedDelta += horizontalDelta;

		// Determine current swipe direction
		const newDirection: NavigationDirection | null =
			this.accumulatedDelta < 0 ? 'back' :
			this.accumulatedDelta > 0 ? 'forward' : null;

		// If direction changed, reset — allows cancelling a swipe by reversing
		if (this.currentDirection && newDirection && this.currentDirection !== newDirection) {
			this.resetSwipeState();
			this.swipeActive = true;
			this.accumulatedDelta = horizontalDelta;
		}

		this.currentDirection = newDirection;

		// Check if navigation is possible for this direction
		if (this.currentDirection && !this.canNavigate(this.currentDirection)) {
			return;
		}

		// Calculate progress towards threshold.
		// threshold = sensitivity × SWIPE_THRESHOLD_MULTIPLIER (default: 50 × 3 = 150px)
		const threshold = this.settings.sensitivity * SWIPE_THRESHOLD_MULTIPLIER;
		const progress = Math.abs(this.accumulatedDelta) / threshold;

		// Update visual indicator
		if (this.currentDirection) {
			this.updateIndicator(this.currentDirection, progress);
		}

		// Track whether threshold is reached (navigation deferred to gesture end / finger lift)
		this.thresholdReached = progress >= 1;
	}

	private resetSwipeState() {
		this.accumulatedDelta = 0;
		this.currentDirection = null;
		this.swipeActive = false;
		this.thresholdReached = false;
	}

	// === Gesture Idle Detection ===

	/**
	 * Reset the idle timer. Called on every wheel event to keep the gesture alive.
	 * When no wheel events arrive for GESTURE_IDLE_TIMEOUT (200ms), the gesture
	 * is considered ended (finger lifted from trackpad).
	 */
	private resetGestureIdleTimer() {
		this.clearGestureIdleTimer();
		this.gestureIdleTimer = setTimeout(() => {
			this.onGestureEnd();
		}, GESTURE_IDLE_TIMEOUT);
	}

	private clearGestureIdleTimer() {
		if (this.gestureIdleTimer !== null) {
			clearTimeout(this.gestureIdleTimer);
			this.gestureIdleTimer = null;
		}
	}

	/**
	 * Called when no wheel events have arrived for GESTURE_IDLE_TIMEOUT ms.
	 * This approximates the "finger lifted" moment. Navigation only fires here,
	 * not during the gesture — matching Safari's navigate-on-release behavior.
	 */
	private onGestureEnd() {
		if (this.settings.debugMode && this.swipeActive) {
			this.log('Gesture ended (idle timeout)', {
				thresholdReached: this.thresholdReached,
				direction: this.currentDirection,
			});
		}

		// Navigate only on release, and only if threshold was still reached.
		// User can swipe back before releasing to cancel navigation.
		if (this.thresholdReached && this.currentDirection) {
			this.navigate(this.currentDirection);
			// Lock input until the gesture fully ends. This prevents a second
			// navigation if the user keeps swiping after the first one fires.
			this.navigationLocked = true;
		}

		// Smoothly animate indicators back to zero
		this.animateIndicatorReset();
		this.resetSwipeState();
		// Clear the navigation lock — gesture is fully over, ready for the next one
		this.navigationLocked = false;
	}

	private canNavigate(direction: NavigationDirection): boolean {
		// @ts-ignore — activeLeaf is deprecated but still functional
		const leaf = this.app.workspace.activeLeaf;
		if (!leaf?.history) {
			return true;
		}

		if (direction === 'back') {
			return leaf.history.backHistory.length > 0;
		} else {
			return leaf.history.forwardHistory.length > 0;
		}
	}

	// === Navigation ===

	private navigate(direction: NavigationDirection) {
		if (!this.checkCooldown(direction)) {
			return;
		}

		this.lastSwipeTime = Date.now();

		const command = NAVIGATION_COMMANDS[direction];
		// @ts-ignore — executeCommandById is an internal Obsidian API
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
