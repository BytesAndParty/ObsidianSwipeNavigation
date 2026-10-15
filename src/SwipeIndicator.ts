// Phase 3 draft (PLAN.md): not wired into main.ts yet, main.ts still drives
// the old indicator. src/SwipeIndicator.draft.css replaces the indicator
// block in styles.css once this class is used.

import { setIcon } from 'obsidian';
import type { SwipeDirection } from './GestureRecognizer';
import { DECAY_ANIMATION_DURATION } from './types';

// px the circle travels into the pane until the threshold; it starts just outside the edge
const TRAVEL = 60;
// Extra px past the threshold, approached but never reached (rubber band)
const OVERSHOOT = 20;
// Without history in the swipe direction the circle barely moves and stays faint
const DISABLED_TRAVEL = 30;
const DISABLED_OPACITY = 0.6;
// Progress at which the circle is fully opaque
const FADE_IN_PROGRESS = 0.3;
// Scale at progress 0, growing to 1 at the threshold
const MIN_SCALE = 0.7;

interface IndicatorState {
	direction: SwipeDirection;
	progress: number;
	ready: boolean;
	enabled: boolean; // false = no history in this direction
}

/**
 * Safari-style swipe indicator: a round arrow that slides in from the edge of
 * the swiped pane with the finger. One element, moved into whichever window is
 * swiped. Updates are batched to one write per animation frame and only touch
 * CSS variables and classes, never layout properties.
 */
export class SwipeIndicator {
	private readonly containerEl: HTMLElement;
	private pending: IndicatorState | null = null;
	private frame: { win: Window; id: number } | null = null;
	private releaseTimer: number | null = null;

	constructor() {
		// The container covers the swiped pane and clips the circle to it
		this.containerEl = document.body.createDiv({ cls: 'swipe-nav-indicator' });
		const circleEl = this.containerEl.createDiv({ cls: 'swipe-nav-indicator-circle' });
		setIcon(circleEl.createDiv({ cls: 'swipe-nav-indicator-icon' }), 'arrow-left');
	}

	get doc(): Document {
		return this.containerEl.doc;
	}

	/** Cover the swiped pane, in its window. Called once per swipe, before show(). */
	place(paneEl: HTMLElement) {
		this.hide();
		this.moveTo(paneEl.doc);

		const rect = paneEl.getBoundingClientRect();
		const style = this.containerEl.style;
		style.setProperty('--swipe-nav-pane-top', `${rect.top}px`);
		style.setProperty('--swipe-nav-pane-left', `${rect.left}px`);
		style.setProperty('--swipe-nav-pane-width', `${rect.width}px`);
		style.setProperty('--swipe-nav-pane-height', `${rect.height}px`);
	}

	moveTo(doc: Document) {
		if (this.containerEl.doc !== doc) {
			this.cancelFrame();
			doc.body.appendChild(this.containerEl);
		}
	}

	/** Follow the swipe. Batched: only the latest state per frame is drawn. */
	show(direction: SwipeDirection, progress: number, ready: boolean, enabled: boolean) {
		this.pending = { direction, progress, ready: ready && enabled, enabled };
		if (this.frame === null) {
			const win = this.containerEl.win;
			const id = win.requestAnimationFrame(() => {
				this.frame = null;
				this.render();
			});
			this.frame = { win, id };
		}
	}

	/** Hide at once, e.g. when the swipe is back at its start point. */
	hide() {
		this.cancelFrame();
		this.finishRelease();
		this.containerEl.removeClass('is-visible', 'is-ready');
	}

	/** Animate out: a committed swipe pops away, a cancelled one slides back. */
	release(committed: boolean) {
		this.cancelFrame();
		if (!this.containerEl.hasClass('is-visible')) {
			return;
		}

		const reducedMotion = this.containerEl.win.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const style = this.containerEl.style;
		this.containerEl.addClass('is-releasing');
		if (!reducedMotion) {
			if (committed) {
				style.setProperty('--swipe-nav-scale', '1.15');
			} else {
				style.setProperty('--swipe-nav-x', '0px');
				style.setProperty('--swipe-nav-scale', `${MIN_SCALE}`);
			}
		}
		style.setProperty('--swipe-nav-opacity', '0');

		this.releaseTimer = window.setTimeout(() => {
			this.releaseTimer = null;
			this.containerEl.removeClass('is-visible', 'is-releasing', 'is-ready');
		}, DECAY_ANIMATION_DURATION);
	}

	destroy() {
		this.cancelFrame();
		if (this.releaseTimer !== null) {
			window.clearTimeout(this.releaseTimer);
			this.releaseTimer = null;
		}
		this.containerEl.remove();
	}

	private render() {
		const state = this.pending;
		this.pending = null;
		if (!state) {
			return;
		}
		// A new swipe takes over from a running release animation at once (F17)
		this.finishRelease();

		const { direction, progress, ready, enabled } = state;
		const x = travel(progress, enabled) * (direction === 'back' ? 1 : -1);
		const opacity = Math.min(1, progress / FADE_IN_PROGRESS) * (enabled ? 1 : DISABLED_OPACITY);
		const scale = MIN_SCALE + (1 - MIN_SCALE) * Math.min(progress, 1);

		const style = this.containerEl.style;
		style.setProperty('--swipe-nav-x', `${x}px`);
		style.setProperty('--swipe-nav-opacity', `${opacity}`);
		style.setProperty('--swipe-nav-scale', `${scale}`);

		this.containerEl.addClass('is-visible');
		this.containerEl.toggleClass('is-back', direction === 'back');
		this.containerEl.toggleClass('is-forward', direction === 'forward');
		this.containerEl.toggleClass('is-ready', ready);
		this.containerEl.toggleClass('is-disabled', !enabled);
	}

	private finishRelease() {
		if (this.releaseTimer !== null) {
			window.clearTimeout(this.releaseTimer);
			this.releaseTimer = null;
		}
		this.containerEl.removeClass('is-releasing');
	}

	private cancelFrame() {
		if (this.frame !== null) {
			this.frame.win.cancelAnimationFrame(this.frame.id);
			this.frame = null;
		}
		this.pending = null;
	}
}

/** px the circle has moved in: follows the finger up to the threshold, then resists. */
function travel(progress: number, enabled: boolean): number {
	if (!enabled) {
		return DISABLED_TRAVEL * (1 - 1 / (1 + progress));
	}
	if (progress <= 1) {
		return TRAVEL * progress;
	}
	return TRAVEL + OVERSHOOT * (1 - 1 / (1 + 2 * (progress - 1)));
}
