import { Notice, Plugin, WorkspaceLeaf, normalizePath } from 'obsidian';
import {
	SwipeNavigationSettings, DEFAULT_SETTINGS, MIN_DELTA_FOR_LOG,
	SWIPE_THRESHOLD_MULTIPLIER, DECAY_ANIMATION_DURATION
} from './types';
import { SwipeNavigationSettingsTab } from './SettingsTab';
import { evaluateGestureStart } from './context';
import { GestureAxis, GestureRecognizer, SwipeDirection, SwipeRelease } from './GestureRecognizer';
import { GestureRecorder, RecordingScenario, ScenarioSuggestModal, saveTrace } from './GestureRecorder';
import { absoluteEventTime, now } from './clock';

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

// Fallback if a leaf does not expose its history
const NAVIGATION_COMMANDS: Record<SwipeDirection, string> = {
	back: 'app:go-back',
	forward: 'app:go-forward',
};

// === Plugin ===

// Three-finger swipes are not handled here: Obsidian's main process already
// maps the macOS BrowserWindow 'swipe' event to history.back()/forward().
export default class SwipeNavigationPlugin extends Plugin {
	settings: SwipeNavigationSettings;

	// Wheel listeners per window (main window and pop-outs)
	private windowCleanups = new Map<Window, () => void>();
	private readonly onWheel = (event: WheelEvent) => this.handleWheelEvent(event);

	// The recognizer decides axis, progress and release from the wheel events;
	// the plugin adds the context (which pane) and the visual feedback
	private recognizer = new GestureRecognizer({
		axis: axis => this.onAxisLocked(axis),
		progress: (direction, progress, ready) => this.onSwipeProgress(direction, progress, ready),
		release: release => this.onSwipeRelease(release),
		end: () => this.onGestureEnd(),
	}, DEFAULT_SETTINGS.sensitivity * SWIPE_THRESHOLD_MULTIPLIER);
	private gestureTimer: { win: Window; id: number } | null = null;
	private gestureLeaf: WorkspaceLeaf | null = null; // null = rejected at gesture start
	private shownDirection: SwipeDirection | null = null;
	private shownReady: boolean = false;

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
		this.clearGestureTimer();
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

		// A timer of the closing window would never fire: let the main window finish the gesture
		if (this.gestureTimer?.win === win) {
			this.scheduleGestureTimer(window);
		}

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

	private updateIndicator(direction: SwipeDirection, progress: number, ready: boolean) {
		const indicator = direction === 'back' ? this.indicatorLeft : this.indicatorRight;
		if (!indicator) return;

		const clampedProgress = Math.min(Math.max(progress, 0), 1);
		const width = clampedProgress * 60; // max 60px width

		indicator.style.width = `${width}px`;
		indicator.style.opacity = `${clampedProgress}`;

		// Show arrow when ready to navigate on release
		const arrow = indicator.querySelector('.swipe-nav-indicator-arrow') as HTMLElement;
		if (arrow) {
			arrow.style.opacity = ready ? '1' : '0';
		}

		indicator.classList.toggle('ready', ready);
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

		// Negative deltaX swipes back, unless the user reversed the direction
		const dx = this.settings.invertDirection ? -event.deltaX : event.deltaX;
		this.recognizer.feed({ t: absoluteEventTime(event), dx, dy: event.deltaY }, () => this.beginGesture(event));
		this.scheduleGestureTimer(event.win);

		// Debug logging (only when debugMode is enabled)
		if (this.settings.debugMode && (Math.abs(event.deltaX) > MIN_DELTA_FOR_LOG || Math.abs(event.deltaY) > MIN_DELTA_FOR_LOG)) {
			this.log('Wheel event:', {
				deltaX: event.deltaX.toFixed(2),
				deltaY: event.deltaY.toFixed(2),
				phase: this.recognizer.phase,
			});
		}
	}

	/**
	 * Called by the recognizer for the first event of every gesture, including
	 * vertical scrolling. Decides once whether the gesture may navigate.
	 */
	private beginGesture(event: WheelEvent): boolean {
		const start = evaluateGestureStart(this.app.workspace, event, this.settings.disabledViewTypes);
		this.gestureLeaf = start.leaf;

		const details = { accepted: start.leaf !== null, reason: start.reason, viewType: start.viewType };
		this.log('Gesture started', details);
		this.recorder.mark('gesture-start', details);
		return start.leaf !== null;
	}

	private onAxisLocked(axis: GestureAxis) {
		this.log('Axis locked', { axis });
		this.recorder.mark('axis', { axis });

		if (axis === 'horizontal' && this.gestureLeaf) {
			this.placeIndicators(this.gestureLeaf);
		}
	}

	private onSwipeProgress(direction: SwipeDirection | null, progress: number, ready: boolean) {
		const leaf = this.gestureLeaf;
		if (!leaf) return;

		// Crossing the start point: hide the previous direction's indicator, it is no longer updated
		if (direction !== this.shownDirection) {
			this.resetIndicators();
			this.shownDirection = direction;
		}

		// Nothing to show without history in this direction
		if (direction && this.canNavigate(leaf, direction)) {
			this.updateIndicator(direction, progress, ready);
		}

		if (ready !== this.shownReady) {
			this.shownReady = ready;
			this.recorder.mark('threshold', { reached: ready });
		}
	}

	/** Navigation only fires on release, matching Safari's navigate-on-release behavior. */
	private onSwipeRelease(release: SwipeRelease) {
		const details = {
			reason: release.reason,
			direction: release.direction,
			navigate: release.navigate,
			progress: round(release.progress),
			velocity: round(release.velocity),
		};
		this.log('Swipe released', details);
		this.recorder.mark('release', details);

		const leaf = this.gestureLeaf;
		if (release.navigate && release.direction && leaf && this.settings.enabled && this.canNavigate(leaf, release.direction)) {
			this.navigate(leaf, release.direction);
		}

		// Smoothly animate indicators back to zero
		this.animateIndicatorReset();
		this.shownDirection = null;
		this.shownReady = false;
	}

	private onGestureEnd() {
		this.recorder.mark('gesture-end');
		this.gestureLeaf = null;
	}

	private canNavigate(leaf: WorkspaceLeaf, direction: SwipeDirection): boolean {
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

	// === Gesture Timing ===

	/**
	 * The recognizer only sees wheel events. This timer lets it notice pauses:
	 * the release fallback while swiping, and the end of other gestures. It runs
	 * on the window of the wheel events: a hidden main window throttles its
	 * timers, which could delay the release in a pop-out by about 1 s (F36).
	 */
	private scheduleGestureTimer(win: Window) {
		this.clearGestureTimer();
		const deadline = this.recognizer.deadline();
		if (deadline === null) {
			return;
		}
		const id = win.setTimeout(() => {
			this.gestureTimer = null;
			this.recognizer.tick(now());
			this.scheduleGestureTimer(win);
		}, Math.max(0, deadline - now()));
		this.gestureTimer = { win, id };
	}

	private clearGestureTimer() {
		if (this.gestureTimer !== null) {
			this.gestureTimer.win.clearTimeout(this.gestureTimer.id);
			this.gestureTimer = null;
		}
	}

	// === Navigation ===

	/** Navigate the swiped pane, which is not necessarily the focused one. */
	private navigate(leaf: WorkspaceLeaf, direction: SwipeDirection) {
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
		this.recognizer.threshold = this.settings.sensitivity * SWIPE_THRESHOLD_MULTIPLIER;
	}

	async saveSettings() {
		this.recognizer.threshold = this.settings.sensitivity * SWIPE_THRESHOLD_MULTIPLIER;
		await this.saveData(this.settings);
	}
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
