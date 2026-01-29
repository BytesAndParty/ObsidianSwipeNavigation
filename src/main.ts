import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { SwipeNavigationSettings, DEFAULT_SETTINGS, SWIPE_COOLDOWN, MIN_DELTA_FOR_LOG, SWIPE_THRESHOLD_MULTIPLIER, MIN_VELOCITY_TO_ACTIVATE, GESTURE_IDLE_TIMEOUT, DECAY_ANIMATION_DURATION } from './types';
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
	private abortController: AbortController | null = null;

	// Swipe state tracking
	private accumulatedDelta: number = 0;
	private currentDirection: NavigationDirection | null = null;
	private swipeActive: boolean = false; // Only true if velocity threshold was met
	private navigationLocked: boolean = false; // Prevents multiple navigations per gesture
	private gestureIdleTimer: ReturnType<typeof setTimeout> | null = null;

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
		this.abortController?.abort();
		this.abortController = null;
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
				accumulated: this.accumulatedDelta.toFixed(2),
				active: this.swipeActive,
				locked: this.navigationLocked,
			});
		}

		// Ignore if vertical scrolling is dominant
		if (verticalDelta > Math.abs(horizontalDelta)) {
			return;
		}

		// Ignore very small movements
		if (Math.abs(horizontalDelta) < 1) {
			return;
		}

		// Reset the idle timer on every wheel event (gesture is still active)
		this.resetGestureIdleTimer();

		// If navigation already fired for this gesture, ignore further input
		if (this.navigationLocked) {
			return;
		}

		// Check velocity threshold to activate swipe gesture
		// Only activate if this is a fast swipe, not slow horizontal scrolling
		if (!this.swipeActive) {
			if (Math.abs(horizontalDelta) >= MIN_VELOCITY_TO_ACTIVATE) {
				this.swipeActive = true;
				if (this.settings.debugMode) {
					this.log('Swipe activated (velocity threshold met)');
				}
			} else {
				// Too slow, likely horizontal scrolling - ignore
				return;
			}
		}

		// Accumulate the delta
		this.accumulatedDelta += horizontalDelta;

		// Determine current swipe direction
		const newDirection: NavigationDirection | null =
			this.accumulatedDelta < 0 ? 'back' :
			this.accumulatedDelta > 0 ? 'forward' : null;

		// If direction changed, reset
		if (this.currentDirection && newDirection && this.currentDirection !== newDirection) {
			this.resetSwipeState();
			this.swipeActive = true; // Keep active after direction change
			this.accumulatedDelta = horizontalDelta;
		}

		this.currentDirection = newDirection;

		// Check if navigation is possible for this direction
		if (this.currentDirection && !this.canNavigate(this.currentDirection)) {
			// Can't navigate in this direction, don't show indicator
			return;
		}

		// Calculate progress towards threshold
		const threshold = this.settings.sensitivity * SWIPE_THRESHOLD_MULTIPLIER;
		const progress = Math.abs(this.accumulatedDelta) / threshold;

		// Update visual indicator
		if (this.currentDirection) {
			this.updateIndicator(this.currentDirection, progress);
		}

		// Navigate if distance threshold reached (only once per gesture)
		if (progress >= 1 && this.currentDirection) {
			this.navigate(this.currentDirection);
			this.navigationLocked = true;
			this.animateIndicatorReset();
		}
	}

	private resetSwipeState() {
		this.accumulatedDelta = 0;
		this.currentDirection = null;
		this.swipeActive = false;
		this.navigationLocked = false;
	}

	// === Gesture Idle Detection ===

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

	private onGestureEnd() {
		if (this.settings.debugMode && this.swipeActive) {
			this.log('Gesture ended (idle timeout)');
		}
		// Smoothly animate indicators back to zero
		if (!this.navigationLocked) {
			this.animateIndicatorReset();
		}
		this.resetSwipeState();
	}

	private canNavigate(direction: NavigationDirection): boolean {
		const leaf = this.app.workspace.activeLeaf;
		if (!leaf?.history) {
			return true; // If we can't check, assume navigation is possible
		}

		if (direction === 'back') {
			return leaf.history.backHistory.length > 0;
		} else {
			return leaf.history.forwardHistory.length > 0;
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
