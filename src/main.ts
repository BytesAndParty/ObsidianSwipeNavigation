import { Notice, Plugin, WorkspaceLeaf, normalizePath } from 'obsidian';
import {
	SwipeNavigationSettings, DEFAULT_SETTINGS, SWIPE_COOLDOWN,
	MIN_DELTA_FOR_LOG, SWIPE_THRESHOLD_MULTIPLIER, MIN_VELOCITY_TO_ACTIVATE,
	DIRECTION_RATIO, GESTURE_IDLE_TIMEOUT, DECAY_ANIMATION_DURATION
} from './types';
import { SwipeNavigationSettingsTab } from './SettingsTab';
import { evaluateGestureStart } from './context';
import { GestureRecorder, RecordingScenario, ScenarioSuggestModal, saveTrace } from './GestureRecorder';

// === Type Declarations for Obsidian Internal API ===

interface LeafHistory {
	backHistory: unknown[];
	forwardHistory: unknown[];
	back(): Promise<void>;
	forward(): Promise<void>;
}

declare module 'obsidian' {
	interface App {
		commands: {
			executeCommandById(id: string): boolean;
		};
	}
	interface WorkspaceLeaf {
		history?: LeafHistory;
	}
}

// === Constants ===

type NavigationDirection = 'back' | 'forward';

// Fallback if a leaf does not expose its history
const NAVIGATION_COMMANDS: Record<NavigationDirection, string> = {
	back: 'app:go-back',
	forward: 'app:go-forward',
};

// === Plugin ===

// Three-finger swipes are not handled here: Obsidian's main process already
// maps the macOS BrowserWindow 'swipe' event to history.back()/forward().
export default class SwipeNavigationPlugin extends Plugin {
	settings: SwipeNavigationSettings;
	private lastSwipeTime: number = 0;

	// Wheel listeners per window (main window and pop-outs)
	private windowCleanups = new Map<Window, () => void>();
	private readonly onWheel = (event: WheelEvent) => this.handleWheelEvent(event);

	// Gesture state: a gesture lasts from its first horizontal wheel event
	// until no wheel events arrive for GESTURE_IDLE_TIMEOUT
	private gestureInProgress: boolean = false;
	private gestureLeaf: WorkspaceLeaf | null = null; // null = rejected at gesture start
	private accumulatedDelta: number = 0;
	private currentDirection: NavigationDirection | null = null;
	private swipeActive: boolean = false;
	private thresholdReached: boolean = false;
	private gestureIdleTimer: ReturnType<typeof setTimeout> | null = null;

	// Visual indicator elements
	private indicatorLeft: HTMLElement | null = null;
	private indicatorRight: HTMLElement | null = null;

	// Gesture recording (debug mode only)
	private recorder = new GestureRecorder();
	private recordingStatusEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SwipeNavigationSettingsTab(this.app, this));

		this.createIndicators();
		this.attachToWindow(window);
		this.app.workspace.onLayoutReady(() => this.attachToOpenWindows());
		this.registerEvent(this.app.workspace.on('window-open', (_workspaceWindow, win) => this.attachToWindow(win)));
		this.registerEvent(this.app.workspace.on('window-close', (_workspaceWindow, win) => this.detachFromWindow(win)));

		this.registerRecordingCommands();

		this.log('Plugin loaded');
	}

	onunload() {
		this.windowCleanups.forEach(cleanup => cleanup());
		this.windowCleanups.clear();
		this.clearGestureIdleTimer();
		this.removeIndicators();
		this.log('Plugin unloaded');
	}

	// === Window Handling ===

	private attachToWindow(win: Window) {
		if (this.windowCleanups.has(win)) return;

		win.document.addEventListener('wheel', this.onWheel, { passive: true });
		this.windowCleanups.set(win, () => win.document.removeEventListener('wheel', this.onWheel));
		this.log('Wheel listener attached', { popout: win !== window });
	}

	/** Pop-outs restored with the layout or open before the plugin was enabled */
	private attachToOpenWindows() {
		this.app.workspace.iterateAllLeaves(leaf => this.attachToWindow(leaf.view.containerEl.win));
	}

	private detachFromWindow(win: Window) {
		this.windowCleanups.get(win)?.();
		this.windowCleanups.delete(win);

		// Rescue the indicators before the pop-out's document goes away
		if (this.indicatorLeft?.doc === win.document) {
			this.moveIndicatorsTo(document);
		}
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

	private moveIndicatorsTo(doc: Document) {
		for (const indicator of [this.indicatorLeft, this.indicatorRight]) {
			if (indicator && indicator.doc !== doc) {
				doc.body.appendChild(indicator);
			}
		}
	}

	/** Show the indicators at the edges of the swiped pane, not the window. */
	private placeIndicators(leaf: WorkspaceLeaf) {
		const paneEl = leaf.view.containerEl;
		const rect = paneEl.getBoundingClientRect();
		this.moveIndicatorsTo(paneEl.doc);

		for (const indicator of [this.indicatorLeft, this.indicatorRight]) {
			indicator?.style.setProperty('--swipe-nav-pane-center', `${rect.top + rect.height / 2}px`);
			indicator?.style.setProperty('--swipe-nav-pane-left', `${rect.left}px`);
			indicator?.style.setProperty('--swipe-nav-pane-right', `${paneEl.win.innerWidth - rect.right}px`);
		}
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

	// === Two-Finger Swipe Detection ===

	private handleWheelEvent(event: WheelEvent) {
		// Record raw input before any filtering
		this.recorder.record(event);

		if (!this.settings.enabled) {
			return;
		}

		const scrollDelta = event.deltaX;
		const verticalDelta = Math.abs(event.deltaY);

		// Debug logging (only when debugMode is enabled)
		if (this.settings.debugMode && (Math.abs(scrollDelta) > MIN_DELTA_FOR_LOG || verticalDelta > MIN_DELTA_FOR_LOG)) {
			this.log('Wheel event:', {
				deltaX: scrollDelta.toFixed(2),
				deltaY: event.deltaY.toFixed(2),
				accumulated: this.accumulatedDelta.toFixed(2),
				active: this.swipeActive,
				ready: this.thresholdReached,
			});
		}

		// Require horizontal movement to dominate vertical by DIRECTION_RATIO (2.5:1).
		// Chromium uses this ratio to distinguish intentional horizontal swipes from
		// diagonal scrolling. A simple `>` comparison was too permissive.
		if (verticalDelta * DIRECTION_RATIO > Math.abs(scrollDelta)) {
			return;
		}

		// Ignore very small movements (sub-pixel noise from trackpad)
		if (Math.abs(scrollDelta) < 1) {
			return;
		}

		// The first horizontal event after an idle period starts a new gesture.
		// Whether it may navigate is decided once and holds until it ends.
		if (!this.gestureInProgress) {
			this.beginGesture(event);
		}

		// Reset the idle timer on every wheel event (gesture is still active)
		this.resetGestureIdleTimer();

		const leaf = this.gestureLeaf;
		if (!leaf) {
			return;
		}

		const horizontalDelta = this.settings.invertDirection ? -scrollDelta : scrollDelta;

		// Check velocity threshold to activate swipe gesture.
		// Only activate if this is a fast swipe, not slow horizontal scrolling.
		// MIN_VELOCITY_TO_ACTIVATE (25px) per single event filters out gentle
		// horizontal panning (e.g. in graph view or wide tables).
		if (!this.swipeActive) {
			if (Math.abs(horizontalDelta) >= MIN_VELOCITY_TO_ACTIVATE) {
				this.swipeActive = true;
				this.log('Swipe activated (velocity threshold met)');
				this.recorder.mark('swipe-activated');
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

		// If direction changed, reset — allows cancelling a swipe by reversing.
		// Hide the previous direction's indicator, it is no longer updated.
		if (this.currentDirection && newDirection && this.currentDirection !== newDirection) {
			this.resetSwipeState();
			this.resetIndicators();
			this.swipeActive = true;
			this.accumulatedDelta = horizontalDelta;
		}

		this.currentDirection = newDirection;

		// Check if navigation is possible for this direction
		if (this.currentDirection && !this.canNavigate(leaf, this.currentDirection)) {
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
		const reached = progress >= 1;
		if (reached !== this.thresholdReached) {
			this.recorder.mark('threshold', { reached });
		}
		this.thresholdReached = reached;
	}

	private beginGesture(event: WheelEvent) {
		const start = evaluateGestureStart(this.app.workspace, event, this.settings.disabledViewTypes);
		this.gestureInProgress = true;
		this.gestureLeaf = start.leaf;

		if (start.leaf) {
			this.placeIndicators(start.leaf);
		}

		const details = { accepted: start.leaf !== null, reason: start.reason, viewType: start.viewType };
		this.log('Gesture started', details);
		this.recorder.mark('gesture-start', details);
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
			this.gestureIdleTimer = null;
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
		const details = { thresholdReached: this.thresholdReached, direction: this.currentDirection };
		if (this.swipeActive) {
			this.log('Gesture ended (idle timeout)', details);
		}
		this.recorder.mark('gesture-end', details);

		// Navigate only on release, and only if threshold was still reached.
		// User can swipe back before releasing to cancel navigation.
		if (this.gestureLeaf && this.thresholdReached && this.currentDirection) {
			this.navigate(this.gestureLeaf, this.currentDirection);
		}

		// Smoothly animate indicators back to zero
		this.animateIndicatorReset();
		this.resetSwipeState();
		this.gestureInProgress = false;
		this.gestureLeaf = null;
	}

	private canNavigate(leaf: WorkspaceLeaf, direction: NavigationDirection): boolean {
		const history = leaf.history;
		if (!history) {
			return true;
		}

		if (direction === 'back') {
			return history.backHistory.length > 0;
		} else {
			return history.forwardHistory.length > 0;
		}
	}

	// === Navigation ===

	/** Navigate the swiped pane, which is not necessarily the focused one. */
	private navigate(leaf: WorkspaceLeaf, direction: NavigationDirection) {
		if (!this.checkCooldown(direction)) {
			return;
		}

		this.lastSwipeTime = Date.now();
		this.recorder.mark('navigate', { direction });

		const history = leaf.history;
		if (history && typeof history[direction] === 'function') {
			this.log(`Navigating ${direction.toUpperCase()}`);
			history[direction]().catch(error => this.logWarn(`Navigation ${direction} failed`, error));
			return;
		}

		// The navigation commands act on the active leaf, so focus the swiped one first
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		const command = NAVIGATION_COMMANDS[direction];
		const success = this.app.commands.executeCommandById(command);

		if (success) {
			this.log(`Navigating ${direction.toUpperCase()} (via command)`);
		} else {
			this.logWarn(`Navigation ${direction} failed - command not found`);
			new Notice(`Swipe Navigation: Could not navigate ${direction}`);
		}
	}

	private checkCooldown(direction: NavigationDirection): boolean {
		const now = Date.now();
		const timeSinceLastSwipe = now - this.lastSwipeTime;

		if (timeSinceLastSwipe < SWIPE_COOLDOWN) {
			this.log(`Navigate ${direction} blocked by cooldown (${timeSinceLastSwipe}ms < ${SWIPE_COOLDOWN}ms)`);
			return false;
		}

		return true;
	}

	// === Gesture Recording ===

	private registerRecordingCommands() {
		this.addCommand({
			id: 'start-gesture-recording',
			name: 'Start gesture recording (debug)',
			checkCallback: (checking) => {
				if (!this.settings.debugMode || this.recorder.isRecording) return false;
				if (!checking) {
					new ScenarioSuggestModal(this.app, scenario => this.startRecording(scenario)).open();
				}
				return true;
			},
		});

		this.addCommand({
			id: 'stop-gesture-recording',
			name: 'Stop gesture recording and save trace (debug)',
			checkCallback: (checking) => {
				if (!this.recorder.isRecording) return false;
				if (!checking) {
					void this.stopRecording();
				}
				return true;
			},
		});

		// Shows when a navigation actually took effect, relative to the input
		this.registerEvent(this.app.workspace.on('file-open', file => {
			this.recorder.mark('file-open', { path: file?.path ?? null });
		}));
	}

	private startRecording(scenario: RecordingScenario) {
		this.recorder.start(scenario);

		const statusEl = this.addStatusBarItem();
		statusEl.addClass('swipe-nav-recording', 'mod-clickable');
		statusEl.setText(`● REC ${scenario.name}`);
		statusEl.setAttr('aria-label', 'Stop gesture recording and save trace');
		statusEl.addEventListener('click', () => void this.stopRecording());
		this.recordingStatusEl = statusEl;

		new Notice(`Recording "${scenario.name}"\n\n${scenario.instructions}\n\nClick "● REC" in the status bar to stop.`, 10000);
	}

	private async stopRecording() {
		this.recordingStatusEl?.remove();
		this.recordingStatusEl = null;

		const trace = this.recorder.stop({ settings: { ...this.settings }, pluginVersion: this.manifest.version });
		if (!trace) return;

		try {
			const path = await saveTrace(this.app, this.pluginDir(), trace);
			new Notice(`Trace saved (${trace.events.length} wheel events):\n${path}`);
		} catch (error) {
			this.logWarn('Could not save trace', error);
			new Notice('Swipe Navigation: Could not save the trace, see the developer console');
		}
	}

	private pluginDir(): string {
		return this.manifest.dir ?? normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}`);
	}

	// === Utilities ===

	private log(message: string, data?: unknown) {
		if (!this.settings.debugMode) return;
		console.log('[SwipeNavigation]', message, data ?? '');
	}

	private logWarn(message: string, data?: unknown) {
		console.warn('[SwipeNavigation]', message, data ?? '');
	}

	// === Settings Management ===

	async loadSettings() {
		const saved = (await this.loadData()) ?? {};
		// Left over from the removed three-finger mode
		delete saved.swipeMode;
		this.settings = {
			...DEFAULT_SETTINGS,
			disabledViewTypes: [...DEFAULT_SETTINGS.disabledViewTypes],
			...saved,
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
