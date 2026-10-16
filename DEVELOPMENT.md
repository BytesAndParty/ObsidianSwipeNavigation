# Development Guide

## Project Structure

```
src/
  main.ts               # Plugin class: window listeners, gesture wiring, navigation, recording commands
  GestureRecognizer.ts  # Pure state machine: axis lock, progress, momentum, release decision
  context.ts            # Once per gesture: may it navigate, and which pane
  SwipeIndicator.ts     # Safari-style indicator, batched per animation frame
  input.ts              # Pure mouse-wheel heuristic, shared with the analysis script
  GestureRecorder.ts    # Debug-mode trace recorder and scenario picker
  trace.ts              # Trace file format
  clock.ts              # Absolute timestamps across windows
  types.ts              # Settings, defaults, constants
  SettingsTab.ts        # Settings UI
test/
  GestureRecognizer.test.ts  # Synthetic gestures
  context.test.ts            # Scroll-container check of the gesture context, with DOM fakes
  replay.test.ts             # Replays recorded traces from test/fixtures/traces/
scripts/
  analyze-traces.ts     # One row per gesture for recorded traces
styles.css              # Indicator, settings and recording styles
PLAN.md                 # v1.1 rework: goal, phases, decisions, risks (German)
TODO.md                 # Findings F1-F39 and checklists
```

`GestureRecognizer.ts`, `input.ts` and `trace.ts` must not import `obsidian`: Bun runs them outside Obsidian in tests and scripts.

## Quick Start

```bash
bun install
bun run dev      # rebuild on change, with source maps
bun test         # recognizer tests
bun run build    # type check + production build
```

Copy `main.js`, `manifest.json` and `styles.css` to `<vault>/.obsidian/plugins/obsidian-swipe-navigation/` and reload Obsidian (`Cmd+R` / `Ctrl+R`).

## How a Swipe Is Processed

1. `main.ts` listens to `wheel` events (passive) on every window and feeds them to the `GestureRecognizer`.
2. For the first event of each gesture the recognizer asks `context.ts` whether the gesture may navigate. The answer holds until the gesture ends, including momentum, like Chromium's scroll latching.
3. The recognizer locks the axis, reports progress (distance from the start point / threshold) with a hysteresis-based "ready" state, and detects the release: momentum (smoothly decaying deltas after a peak) or a pause. On release it decides between navigate and cancel, including quick flicks.
4. `main.ts` shows the progress with `SwipeIndicator` and navigates the pane's own history (`leaf.history`), falling back to the `app:go-back` / `app:go-forward` commands.

All recognizer parameters (`RECOGNIZER_DEFAULTS`) are provisional until tuned with recorded traces.

## Recording and Tuning

With debug mode on:

1. Run **Start gesture recording (debug)** from the command palette and pick a scenario (or type a custom name). The scenario's instructions appear as a notice.
2. Perform the gestures, then click **● REC** in the status bar (or run **Stop gesture recording and save trace**).
3. The trace is saved as JSON to `<plugin folder>/traces/`.

Analyse traces:

```bash
bun run analyze-traces <trace.json | folder>
```

One row per gesture: event count, duration, sums, max delta, `wheelDeltaX / deltaX` ratio, event interval, zero-delta events, decaying tail and the plugin's markers (gesture start, axis, ready, release, navigate, file-open).

To tune the recognizer, copy representative traces to `test/fixtures/traces/`. `test/replay.test.ts` replays them and checks the outcome per scenario (e.g. "back-cancel" must not navigate).

## Debugging

- Developer Tools: `Cmd+Opt+I` (macOS) or `Ctrl+Shift+I` (Windows)
- With debug mode on, the console shows gesture starts (accepted or rejected with reason and view type), axis locks, releases and navigations, prefixed `[SwipeNavigation]`

## Obsidian Internals

`main.ts` types the internal APIs it uses via `declare module 'obsidian'`:

- `WorkspaceLeaf.history` (`backHistory`, `forwardHistory`, `back()`, `forward()`)
- `App.commands.executeCommandById()` for the fallback commands

## Release Process

See PLAN.md, Phase 4. In short: bump the version in `manifest.json`, `package.json` and `versions.json`, run `bun run build`, test, tag, and attach `main.js`, `manifest.json` and `styles.css` to the GitHub release.

## Resources

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Home)
- [Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Bun Documentation](https://bun.sh/docs)
- [esbuild Documentation](https://esbuild.github.io/)
