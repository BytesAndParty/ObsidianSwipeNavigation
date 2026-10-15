// === Clock ===
// Absolute times in ms (epoch-based), comparable across the main window and
// pop-outs, which each have their own performance time origin.

export function now(): number {
	return performance.timeOrigin + performance.now();
}

// event.timeStamp is relative to the time origin of the window the event came from
export function absoluteEventTime(event: Event): number {
	const view = (event as UIEvent).view;
	return (view ?? window).performance.timeOrigin + event.timeStamp;
}
