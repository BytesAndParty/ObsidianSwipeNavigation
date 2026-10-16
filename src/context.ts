import { Workspace, WorkspaceLeaf } from 'obsidian';
import { isLikelyMouseWheel } from './input';

// === Gesture Context ===
// Decides once per gesture, from its first wheel event, whether the gesture
// may navigate at all. Browsers latch a scroll gesture to one scroll
// target the same way, so a gesture that starts scrolling a code block keeps
// scrolling it (including momentum) instead of navigating halfway through.

// Tolerance for sub-pixel rounding in scroll measurements
const SCROLL_EPSILON = 1;

export type GestureRejectReason =
	| 'modifier-key'
	| 'mouse-wheel'
	| 'no-pane'
	| 'sidebar'
	| 'disabled-view'
	| 'scrollable-content';

export interface GestureStart {
	// Pane the gesture navigates, null when the gesture was rejected
	leaf: WorkspaceLeaf | null;
	reason?: GestureRejectReason;
	viewType?: string;
}

interface LegacyWheelEvent extends WheelEvent {
	wheelDeltaX?: number;
}

export function evaluateGestureStart(
	workspace: Workspace,
	event: WheelEvent,
	disabledViewTypes: string[],
): GestureStart {
	// Shift + wheel scrolls horizontally, Ctrl/Cmd + wheel zooms
	if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
		return { leaf: null, reason: 'modifier-key' };
	}
	if (isLikelyMouseWheel(event.deltaMode, event.deltaX, (event as LegacyWheelEvent).wheelDeltaX ?? 0)) {
		return { leaf: null, reason: 'mouse-wheel' };
	}

	// Modals, menus, the ribbon and the status bar are outside every pane
	const target = event.target as Node | null;
	const leaf = target ? findLeafAt(workspace, target) : null;
	if (!target || !leaf) {
		return { leaf: null, reason: 'no-pane' };
	}

	const viewType = leaf.view.getViewType();
	if (isSidebarLeaf(workspace, leaf)) {
		return { leaf: null, reason: 'sidebar', viewType };
	}
	if (disabledViewTypes.includes(viewType)) {
		return { leaf: null, reason: 'disabled-view', viewType };
	}
	if (canScrollHorizontally(target, leaf.view.containerEl, event.deltaX)) {
		return { leaf: null, reason: 'scrollable-content', viewType };
	}

	return { leaf, viewType };
}

function findLeafAt(workspace: Workspace, target: Node): WorkspaceLeaf | null {
	let found = null as WorkspaceLeaf | null;
	workspace.iterateAllLeaves(leaf => {
		if (!found && leaf.view.containerEl.contains(target)) {
			found = leaf;
		}
	});
	return found;
}

function isSidebarLeaf(workspace: Workspace, leaf: WorkspaceLeaf): boolean {
	const root = leaf.getRoot();
	return root === workspace.leftSplit || root === workspace.rightSplit;
}

/**
 * Whether any element between the target and the pane boundary can still
 * scroll in the direction of scrollDelta. Like Safari, swiping only navigates
 * once the content under the pointer has reached its edge.
 */
function canScrollHorizontally(target: Node, boundary: HTMLElement, scrollDelta: number): boolean {
	// A gesture that starts vertically latches to a vertical scroller (Chromium's
	// scroll latching), so horizontally scrollable content does not scroll (F35)
	if (scrollDelta === 0) {
		return false;
	}

	let el: Element | null = target.instanceOf(Element) ? target : target.parentElement;
	while (el) {
		if (isScrollableTowards(el, scrollDelta)) {
			return true;
		}
		if (el === boundary) {
			break;
		}
		el = el.parentElement;
	}
	return false;
}

function isScrollableTowards(el: Element, scrollDelta: number): boolean {
	const maxScroll = el.scrollWidth - el.clientWidth;
	if (maxScroll <= SCROLL_EPSILON) {
		return false;
	}

	const style = el.win.getComputedStyle(el);
	if (style.overflowX !== 'auto' && style.overflowX !== 'scroll') {
		return false;
	}

	// scrollLeft counts from 0 at the start edge: positive in LTR, negative in RTL
	const distanceFromStart = Math.abs(el.scrollLeft);
	const canScrollTowardsStart = distanceFromStart > SCROLL_EPSILON;
	const canScrollTowardsEnd = distanceFromStart < maxScroll - SCROLL_EPSILON;
	const towardsEnd = style.direction === 'rtl' ? scrollDelta < 0 : scrollDelta > 0;
	return towardsEnd ? canScrollTowardsEnd : canScrollTowardsStart;
}
