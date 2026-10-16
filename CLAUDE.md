# Obsidian Swipe Navigation - Claude Context

## Project Overview

Obsidian desktop plugin enabling two-finger trackpad swipe gestures for back/forward navigation through note history (Safari-style). Desktop-only (macOS, Windows, Linux).

- **Plugin ID:** obsidian-swipe-navigation (to be renamed before submission, see PLAN.md Phase 4)
- **Author:** Robert Stickler
- **License:** MIT

**v1.1 rework in progress:** [PLAN.md](PLAN.md) (German) has the goal, phases, decisions and risks; [TODO.md](TODO.md) has the findings F1–F39 and the checklists. Read both before changing gesture behavior.

**Start here:** PLAN.md → "Übergabe (Stand 2026-10-15, abends)": state, open items in order, what was tried for release detection, the 3 failing tests. Phase 2 (recognizer) is work in progress, Phase 3 (indicator) is a draft not wired into main.ts, nothing is tested on a device.

**Working rules (Robert):** an independent subagent reviews each big step against PLAN.md/TODO.md; commit per step only after Robert reviewed the changes; commit messages without AI references, conventional commits, no em dash, on `main`, no push.

## Tech Stack

- **Language:** TypeScript 5.3 (strict null checks)
- **Build:** esbuild 0.19 via `esbuild.config.mjs`
- **Package Manager:** Bun (always use `bun`, never npm/yarn/pnpm)
- **Module Format:** CommonJS output (required by Obsidian)
- **Target:** ES2018
- **Obsidian API:** latest

## Commands

- `bun install` — install dependencies
- `bun run dev` — development mode with file watching and source maps
- `bun run build` — production build (TypeScript check + minified output)
- `bun test` — recognizer tests (synthetic gestures + replay of `test/fixtures/traces/`)
- `bun run analyze-traces <trace.json | folder>` — summarise recorded gesture traces, one row per gesture

## Vault Path

- **Test Vault:** `/Users/robert.stickler/Library/CloudStorage/OneDrive-Personal/Dokumente/Obsidian/UnfilteredMe/`
- **Plugin Install Dir:** `<vault>/.obsidian/plugins/obsidian-swipe-navigation/`
- The vault also contains a stale `swipe-navigation` folder with the same plugin ID; remove it before testing
- After `bun run build`, copy `main.js`, `manifest.json`, `styles.css` to the plugin install dir, then reload Obsidian (`Cmd+R`)
- Recorded traces land in `<plugin install dir>/traces/`

## Project Structure

```
src/
  main.ts              — Plugin class: window listeners, gesture wiring, navigation, recording commands
  GestureRecognizer.ts — Pure state machine: axis lock, progress, ready hysteresis, momentum, release decision
  context.ts           — Decides once per gesture whether it may navigate (modifiers, pane, sidebar, disabled views, scrollable content)
  SwipeIndicator.ts    — Phase 3 draft, NOT wired yet: Safari-style indicator, batched per animation frame
  SwipeIndicator.draft.css — Phase 3 draft styles, replace the indicator block in styles.css when wiring in
  input.ts             — Pure wheel input classification (mouse-wheel heuristic), shared with the analysis script
  GestureRecorder.ts   — Debug-mode trace recorder, scenario picker, trace saving
  trace.ts             — Trace file format (types and constants only, no 'obsidian' import)
  clock.ts             — Absolute timestamps comparable across windows
  types.ts             — Settings interface, defaults, constants
  SettingsTab.ts       — Obsidian settings tab UI
test/
  GestureRecognizer.test.ts — Synthetic gestures per finding
  replay.test.ts            — Replays recorded traces per scenario
scripts/
  analyze-traces.ts    — Offline trace analysis (runs with Bun outside Obsidian)
styles.css           — Plugin styles (indicators, settings, recording)
manifest.json        — Obsidian plugin metadata
esbuild.config.mjs   — Build configuration
main.js              — Compiled output (generated, do not edit)
```

## Architecture

- Extends Obsidian `Plugin` class
- Passive `wheel` listeners on the document of every window (main window and pop-outs), tracked in `windowCleanups`, attached on `window-open`, detached on `window-close`
- `main.ts` feeds every wheel event to `GestureRecognizer` (pure, no DOM) and reacts to its callbacks (`axis`, `progress`, `release`, `end`); a timer calls `tick()` so pauses are noticed
- For the first event of each gesture (vertical scrolling included) the recognizer calls back into `evaluateGestureStart()` (context.ts), which decides once whether the gesture may navigate and which pane it navigates. The decision holds until the gesture ends, including momentum
- Recognizer: axis lock after 12 px, offset from the gesture start, threshold = `sensitivity * SWIPE_THRESHOLD_MULTIPLIER`, ready with hysteresis, release inferred from equal speed steps (pending → confirmed or resumed) or a 400 ms pause, flick detection, momentum swallowed afterwards. Parameters in `RECOGNIZER_DEFAULTS` are provisional until tuned with traces
- Navigation uses the swiped pane's own history (`leaf.history.back()/forward()`), with `app:go-back`/`app:go-forward` as fallback
- Visual feedback: still the old edge indicators in main.ts (`--swipe-nav-pane-*` CSS variables); `SwipeIndicator` replaces them in Phase 3
- Debug mode: gesture recorder writes raw wheel events plus markers as JSON traces for tuning
- Settings persisted via Obsidian's `loadData()`/`saveData()`

## Coding Conventions

- **Classes:** PascalCase (`SwipeNavigationPlugin`)
- **Methods:** camelCase (`handleWheelEvent`, `beginGesture`)
- **Constants:** UPPER_SNAKE_CASE (`SWIPE_THRESHOLD_MULTIPLIER`)
- **CSS classes:** `swipe-nav-*` prefix
- **Section dividers:** `// === Section Name ===`
- **Logging:** prefixed `[SwipeNavigation]`; `log()` only with `debugMode`, `logWarn()` always
- **Private members:** use TypeScript `private` keyword
- **CSS variables:** use Obsidian's built-in variables (`--interactive-accent`, `--text-on-accent`, etc.)
- **Obsidian internals:** typed via `declare module 'obsidian'` augmentation in main.ts, not `@ts-ignore`
- **Pure modules** (`GestureRecognizer.ts`, `input.ts`, `trace.ts`) must not import `obsidian`, so Bun scripts and tests can load them

## Key Design Decisions

- Passive wheel listeners (`{ passive: true }`), the plugin never blocks scrolling
- Safari's trackpad swipe is the UX reference: navigate on release, cancel by swiping back
- Gesture context is latched at the gesture start, like browser scroll latching
- Three-finger swipes are not handled: Obsidian already maps the macOS `swipe` event to history back/forward
- Parameters are tuned with recorded traces, not guessed (PLAN.md)

## Important Notes

- `main.js` is generated — never edit directly
- Plugin is desktop-only (`isDesktopOnly: true` in manifest)
- No native OS gesture API access (Electron limitation) — `wheel` events cannot tell finger-down, finger-lifted and momentum apart
- `CLAUDE.md` is committed; the local permissions in `.claude/` are in `.gitignore`
