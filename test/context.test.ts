import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Workspace, WorkspaceLeaf } from 'obsidian';
import { evaluateGestureStart } from '../src/context';

// The gesture context reads the DOM, which Bun does not have. These fakes
// provide only what src/context.ts touches: the parent chain, scroll metrics,
// the computed overflow and Obsidian's instanceOf() and win helpers.

class FakeElement {
	scrollWidth = 100;
	clientWidth = 100;
	scrollLeft = 0;
	readonly win = {
		getComputedStyle: (el: FakeElement) => ({ overflowX: el.overflowX, direction: 'ltr' }),
	};

	constructor(readonly parentElement: FakeElement | null = null, readonly overflowX = 'visible') {}

	instanceOf(type: Function): boolean {
		return this instanceof type;
	}

	contains(node: FakeElement): boolean {
		for (let el: FakeElement | null = node; el; el = el.parentElement) {
			if (el === this) return true;
		}
		return false;
	}
}

// context.ts checks target.instanceOf(Element)
const globals = globalThis as { Element?: unknown };
const realElement = globals.Element;
beforeAll(() => {
	globals.Element = FakeElement;
});
afterAll(() => {
	globals.Element = realElement;
});

/** A pane with a wide code block (400 px of content in 100 px), scrolled to scrollLeft */
function paneWithCodeBlock(scrollLeft: number) {
	const paneEl = new FakeElement();
	const codeBlock = new FakeElement(paneEl, 'auto');
	codeBlock.scrollWidth = 400;
	codeBlock.scrollLeft = scrollLeft;
	const line = new FakeElement(codeBlock);

	const leaf = { view: { containerEl: paneEl, getViewType: () => 'markdown' }, getRoot: () => ({}) };
	const workspace = { leftSplit: {}, rightSplit: {}, iterateAllLeaves: (callback: (l: typeof leaf) => void) => callback(leaf) };
	return { workspace: workspace as unknown as Workspace, leaf: leaf as unknown as WorkspaceLeaf, target: line };
}

/** First wheel event of a gesture from a macOS trackpad (wheelDeltaX = -3 × deltaX) */
function wheel(target: FakeElement, deltaX: number, deltaY: number): WheelEvent {
	return {
		target, deltaX, deltaY, deltaMode: 0, wheelDeltaX: -3 * deltaX,
		shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
	} as unknown as WheelEvent;
}

describe('scrollable content (F5, F35)', () => {
	test('a gesture starting vertically over a horizontally scrollable code block may navigate (F35)', () => {
		const { workspace, leaf, target } = paneWithCodeBlock(150);
		const start = evaluateGestureStart(workspace, wheel(target, 0, 6), []);
		expect(start.reason).toBeUndefined();
		expect(start.leaf).toBe(leaf);
	});

	test('a horizontal start scrolls the code block while it can still scroll that way (F5)', () => {
		const { workspace, target } = paneWithCodeBlock(150);
		for (const deltaX of [-4, 4]) {
			const start = evaluateGestureStart(workspace, wheel(target, deltaX, 0), []);
			expect(start.leaf).toBeNull();
			expect(start.reason).toBe('scrollable-content');
		}
	});

	test('a horizontal start at the edge of the code block may navigate (F5)', () => {
		const { workspace, leaf, target } = paneWithCodeBlock(0);
		const start = evaluateGestureStart(workspace, wheel(target, -4, 0), []);
		expect(start.reason).toBeUndefined();
		expect(start.leaf).toBe(leaf);
	});
});
