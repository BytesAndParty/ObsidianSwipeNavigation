# TODO - Swipe Navigation Plugin

## v1.1 Rework: Bugs, Handling & Feel

Started 2026-10-14 after a code review. Findings are numbered F1–F39; the phases below reference them. Overview, order and decisions: [PLAN.md](PLAN.md).

**Handover 2026-10-15 (evening):** everything is committed on `main` (not pushed). Build green, `bun test` 47 of 50 green. Phase 2 is work in progress, Phase 3 is a draft, nothing is tested on a device yet. Where things stand, what was tried and how to continue: [PLAN.md → Übergabe](PLAN.md#übergabe-stand-2026-10-15-abends).

**2026-10-16:** F35, F36, F38 and F39 implemented, device test pending. `bun test` 54 of 57 green, still only the 3 known failures.

Legend: `[ ]` open · `[~]` implemented, waiting for a test on a real device · `[x]` done · `[-]` obsolete

**Root cause of most problems:** `wheel` events cannot tell "finger resting", "finger lifted" and "momentum" apart, so the 200 ms idle timeout is wrong in both directions (F1, F2). On top of that the plugin did not check *where* a swipe happens (F5–F9).

### Findings

#### Bugs

- [~] **F1 Momentum delays and forces navigation.** After lifting, macOS keeps sending inertial wheel events for up to ~1 s. They extend the idle timer and add to the distance: navigation fires late, short swipes still trigger, cancelling barely works. Now: the release is inferred from the shape of the speed (one speed step freezes the swipe, a second step of equal duration confirms momentum), the frozen state decides and the rest of the momentum is swallowed. See F29 and PLAN.md for the history.
- [~] **F2 Pausing mid-swipe commits.** Holding the fingers still for >200 ms counts as release; moving back afterwards starts a new gesture that may navigate the other way. Now: the idle timeout is only a 400 ms fallback.
- [x] **F3 `navigationLocked` was dead code**: set and cleared in the same function. Removed.
- [x] **F4 Three-finger mode navigated twice.** Obsidian's main process already maps the `BrowserWindow` `swipe` event to `history.back()`/`forward()`, which Obsidian routes to the active leaf's history (confirmed in `obsidian.asar`, Obsidian 1.14.4). Mode removed, settings now explain the built-in macOS option.
- [~] **F5 Horizontally scrollable content scrolled *and* navigated** (code blocks, wide tables, editor without line wrap, Kanban, zoomed PDF). Now: if the content under the pointer can still scroll in the swipe direction, the whole gesture scrolls; swiping navigates only at the edge (like Safari).
- [~] **F6 Swipes over modals, settings, menus or sidebars navigated the note in the background.** Now only panes in the main area (and pop-outs) navigate.
- [~] **F7 Split view navigated the focused pane, not the one under the pointer**; the indicator sat at the window edge. Now the pane under the pointer navigates and the indicator sits at its edges.
- [~] **F8 Shift + mouse wheel and tilt/thumb wheels navigated** (one notch = 100–120 px). Now gestures starting with a modifier key, a line/page delta or a 120-multiple `wheelDeltaX` are ignored. Heuristic: validate with Phase 0 traces.
- [~] **F9 Pop-out windows had no swipe support.** Listener and indicators now follow every window.
- [-] **F10 Three-finger indicator flash was invisible** (both states set in the same frame). Obsolete with F4.
- [~] **F11 Reversing direction left the previous indicator visible.** Now reset on direction change.
- [-] **F12 Silent fallback from three- to two-finger mode.** Obsolete with F4.
- [~] **F13 Direction swapped with natural scrolling off** (Chromium does not expose `directionInvertedFromDevice`). New setting "Reverse swipe direction".
- [~] **F26 Mouse heuristic rejects trackpad gestures.** Chromium reports a trackpad's `wheelDeltaX` as −3 × `deltaX` on macOS (40 px per 120-unit tick) and −1 × `deltaX` on Windows precision touchpads, so trackpad events with `deltaX` ±40/±80 (macOS) or ±120 (Windows) looked like mouse notches and the whole gesture was ignored. Now a 120-multiple only counts as a notch if its ratio to `deltaX` is neither 3 nor 1 (`src/input.ts`, shared with the analysis script). Still misses high-resolution mice and notches at a page zoom other than 100 %.
- [~] **F27 Reversing in one large event overshoots.** On a direction change the accumulated delta restarted at the last event's delta instead of the distance past the start point. Now: the offset counts from the gesture start, without reset.
- [ ] **F28 Swipe distance depends on Obsidian's zoom.** Chromium divides all deltas by the page zoom, so at 150 % a swipe needs 1.5 × the finger travel. Fix needs a reliable source for the zoom factor. → after the device test

#### Handling & feel

- [~] **F14 Activation needs one event with ≥25 px.** Depends on the refresh rate (120 Hz → half the delta per event); slow deliberate swipes never activate; deltas before activation are lost. Now: the swipe activates with the axis lock and counts from the first event.
- [~] **F15 No axis lock.** The 2.5:1 ratio is checked per event, so diagonal swipes flicker in and out. Now: the axis is locked after 12 px for the whole gesture.
- [ ] **F16 Weak indicator feedback.** Linear opacity (barely visible at 30 %), arrow only at 100 %, no resistance past the threshold, no hysteresis (ready state flickers), no feedback when there is no history. Hysteresis done in Phase 2; the rest is drafted in `src/SwipeIndicator.ts`, not wired yet. → Phase 3
- [ ] **F17 `animating` class stays for 250 ms**, so a gesture started right after the previous one lags behind. Drafted in `src/SwipeIndicator.ts`. → Phase 3
- [~] **F18 Cooldown silently drops a quick second swipe** although the indicator showed "ready". Now: no cooldown, a gesture navigates at most once.
- [ ] **F19 No transition after navigating**; content just swaps. → Phase 3 (optional)

#### Code & release

- [x] **F20 Deprecated `workspace.activeLeaf`.** No longer used; the pane comes from the event target.
- [ ] **F21 Inline styles and `querySelector` on every wheel event**; `width` forces layout. Use CSS variables + `transform`, batch per frame. Drafted in `src/SwipeIndicator.ts`. → Phase 3
- [x] **F22 `log()` ignored debug mode.** Now only logs with debug mode on.
- [x] **F23 `h2` heading in the settings tab** (rejected in review). Uses `setHeading()` now.
- [ ] **F24 Plugin ID contains "obsidian"**, which the community submission check rejects. → Phase 4
- [x] **F25 Stale docs.** README links the deleted `TEST.md` and `install-to-vault.sh`; `CLAUDE.md` points to a test vault that no longer exists and describes the old architecture. Updated 2026-10-15: README, DEVELOPMENT.md, DISCLAIMER.md, manifest description, `CLAUDE.md`.

#### Review of Phase 2 (2026-10-15)

Found by an independent subagent review of the first recognizer version; F29 was a blocker.

- [~] **F29 Finger deceleration taken as momentum.** The first version treated any 4 decreasing deltas after a peak as momentum. Deliberate swipes cancelled (a 220 px stroke, a steady 400 px swipe at 120 Hz), and cancels navigated twice: the reversal started a new gesture that navigated the other way. Now (v3): one speed step only freezes the swipe, a second step of equal duration confirms momentum, anything else resumes the swipe. A reversal during settling never starts a gesture (F39). 3 recognizer tests still fail, see PLAN.md.
- [~] **F30 Indicator showed "ready", the release cancelled.** Momentum events added to the offset before they were detected; the decision then used the earlier peak. Now the decision uses the frozen state, which is exactly the progress shown last (test "the decision always matches the progress shown last").
- [~] **F31 A second swipe during momentum was swallowed.** Ending the settling phase needed one event of ≥ 4 px and > 1.5 × the previous one; a smooth ramp never met that. Now two rises in a row above 1.25 × the slowest momentum + 0.05 px/ms start a new gesture, which takes along the movement since the low point. Tests at 60 and 120 Hz.
- [~] **F32 Parameters per event depended on the refresh rate.** A minimum peak of 4 px per event meant swipes slower than 0.48 px/ms at 120 Hz never counted as momentum, so momentum pushed them over the threshold. Now all parameters are in ms and px/ms. Slow swipes with integer deltas (4–5 px per event) remain noisy.
- [~] **F33 A swipe right after vertical scrolling was swallowed.** The swipe's own events kept the rejected vertical gesture alive, so a longer gap would not have helped; the old version allowed it. Now a clearly horizontal event (≥ 2 px, ≥ 2:1) starts a new gesture after a pause of ≥ 50 ms or once the vertical speed fell to ≤ 50 % of its peak. A swipe into fast vertical momentum is still swallowed until it slows down.
- [~] **F34 Double navigation after a blocked main thread.** Chromium coalesces queued wheel events; a coalesced momentum event counted as re-acceleration and started a second swipe. The gesture timer can also end a gesture before queued events are dispatched. Now a new gesture must speed up beyond 1.2 × its first event's speed (delta / time since the previous event) before it can swipe, and settling needs two rises in a row. Tests for both cases.
- [~] **F35 Context check on a vertical first event was too strict.** With `deltaX = 0` at the gesture start, horizontally scrollable content rejected the gesture in both directions. The old version accepted it at the left edge, and Chromium latches a vertical start to a vertical scroller anyway. Now the scroll-container check is skipped when `deltaX` is 0 (`canScrollHorizontally` in `src/context.ts`). Tests in `test/context.test.ts` with DOM fakes.
- [~] **F36 Gesture timer ran on the main window.** If the main window is hidden while the user works in a pop-out, background throttling can delay the release by about 1 s. Now the gesture timer (`scheduleGestureTimer` in `src/main.ts`) runs on the window of the wheel events and moves to the main window if that pop-out closes. The release timer in `SwipeIndicator` runs on the indicator's window; moving the indicator to another window ends a running release. No tests (needs Obsidian's windows).
- [~] **F37 Tests passed for the wrong reason.** Nearly all used constant speeds with instant stops and reversals. Rewritten with minimum-jerk finger strokes, geometric momentum, integer deltas with carry, speed jitter, 60/120 Hz, coalesced events, the timer path and the callback order. Real traces are still missing.
- [~] **F38 `analyze-traces` assigned markers to two rows.** The 500 ms marker tail was not capped at the next gesture, and the 150 ms split cut one recognizer gesture (a hold under 400 ms) into two rows. Now a row's markers end at the next row's first event, and while the recorded markers show a swipe (horizontal axis lock, no release yet) only a 400 ms pause splits. Without markers the 150 ms gap applies as before. Checked with a synthetic trace, real traces pending.
- [~] **F39 A reversal during settling could still start a gesture.** The speed along the momentum turned negative during a reversal; when the reversal slowed down, two rises in a row counted as re-acceleration and started a gesture in the opposite direction, which could navigate if it covered the threshold. Found while writing the handover. Now `followTrail` clamps the speed along the momentum at 0. The reversal is not carried into a following gesture either, it starts at the turning point (with the clamp alone, a short swipe back after a long reversal started "forward" and ready). Tests at 60 and 120 Hz: misdetected release followed by a 400 px reversal, and a short swipe after it.

### Phase 0: Measure

Tune with recorded input instead of guessing.

- [x] Gesture recorder (debug mode): commands "Start gesture recording" / "Stop gesture recording", scenario picker, "● REC" in the status bar (click to stop), trace JSON saved to `<vault>/.obsidian/plugins/obsidian-swipe-navigation/traces/`
- [x] Markers on the same clock: gesture start (accepted / rejected + reason), swipe activated, threshold, gesture end, navigate, file-open
- [x] Phase 2 markers: axis lock, release (reason, decision, velocity)
- [x] `bun run analyze-traces <folder>`: one row per gesture (events, duration, Σdx/Σdy, max delta, event interval, zero-delta events, decaying tail, markers)
- [x] Analysis shows the `wheelDeltaX / deltaX` ratio per gesture and counts notches with the F26 rule (F26)
- [ ] Install the build in the test vault (`UnfilteredMe`, see PLAN.md); remove the stale `swipe-navigation` folder with the same plugin ID first
- [ ] Record each scenario on the MacBook (also on an external 60 Hz display if available):
  - [ ] Swipe back: slow
  - [ ] Swipe back: quick flick
  - [ ] Swipe back: hold, then lift
  - [ ] Swipe back: cancel
  - [ ] Swipe forward
  - [ ] Vertical scrolling
  - [ ] Scroll, then swipe back right away (gap between vertical momentum and the swipe)
  - [ ] Diagonal scrolling
  - [ ] Wide code block or table
  - [ ] Canvas panning
  - [ ] Mouse: Shift + wheel
  - [ ] Mouse: horizontal wheel
  - [ ] Three-finger swipe (expect exactly one `file-open` per swipe)
- [ ] Windows Precision Touchpad recordings (if a machine is available)
- [ ] Evaluate:
  - [x] Does Chromium send a zero-delta event when the fingers lift? macOS: no, the phase-ended event is dropped before JS (Chromium source, see PLAN.md). Windows: maybe a (0,0) event at fling begin (`zero` column in Windows traces).
  - [ ] Momentum tail: decay ratio per event and length, compared with a finger that slows down (most important: "cancel" and "hold, then lift")
  - [ ] Confirm the `wdx/dx` ratios from the Chromium source on real devices: macOS trackpad 3, Windows precision touchpad 1, mouse notches 120 per notch (validates the F8/F26 heuristic)
  - [ ] Deltas per event at 60 Hz vs. 120 Hz
- [ ] Copy representative traces to `test/fixtures/traces/` for the Phase 2 replay tests
- [ ] Tune the Phase 2 parameters with the replay tests

### Phase 1: Quick fixes (low risk)

- [x] Remove three-finger mode, explain the built-in macOS option in settings (F4, F10, F12)
- [x] Drop the legacy `swipeMode` key when loading settings
- [~] Decide once per gesture whether it may navigate; the decision holds until the gesture ends, including momentum (`src/context.ts`)
  - [~] Ignore modifier keys and mouse-wheel notches (F8)
  - [~] Only panes in the main area or pop-outs; nothing over modals, menus, sidebars (F6)
  - [~] Setting "Disabled in views", default `canvas, graph, localgraph, excalidraw`
  - [~] Scroll-container check in the swipe direction (F5)
- [~] Navigate the pane under the pointer via its own history, indicator at its edges (F7, F20)
- [~] Setting "Reverse swipe direction" (F13)
- [~] Pop-out windows: attach on `window-open`, detach on `window-close`, move the indicators into the swiped window (F9)
- [x] Remove `navigationLocked` (F3); reset the previous indicator on direction change (F11)
- [x] `log()` respects debug mode (F22); settings headings via `setHeading()` (F23)
- [~] Mouse heuristic: a 120-multiple `wheelDeltaX` only counts as a notch if it is not 3 × `deltaX` (F26)
- [ ] Device test pass:
  - [ ] Normal swipe back / forward still works
  - [ ] Split view: hovering the other pane navigates that pane, indicator at its edges
  - [ ] Wide code block / table: scrolls first, navigates only from the edge
  - [ ] Canvas: panning never navigates
  - [ ] Settings modal, command palette, sidebars: no navigation
  - [ ] Shift + mouse wheel: no navigation
  - [ ] Pop-out window: swipe works, indicator appears there
  - [ ] "Reverse swipe direction" swaps back/forward
  - [ ] Three-finger swipe (macOS setting on): exactly one step back

### Phase 2: New gesture engine (core of the feel)

Built before the recordings; all numbers are provisional until the traces are in. Current design and history: PLAN.md, Phase 2 and Übergabe.

- [~] DOM-free `GestureRecognizer` fed with `{ t, dx, dy }`, wired into `main.ts` (callbacks `axis`, `progress`, `release`, `end`; timer calls `tick()`)
- [~] States: idle → tracking → swiping (axis locked) / rejected → releasing (pending, display frozen) → commit / cancel → settling
- [~] Context decided at the first event of every gesture, a rejected gesture stays rejected until it ends (including momentum)
- [~] Axis lock after the first 12 px of total movement, horizontal if |Σdx| ≥ 2 × |Σdy| (F15)
- [~] Activation with the axis lock instead of a velocity threshold, counted from the first event (F14); a new gesture must speed up first (F34)
- [~] Offset from the gesture start, direction changes across the start point without reset (F27)
- [~] "Ready" with hysteresis: ready at 100 %, back off below 85 %
- [~] Release v3: equal speed steps (peak → 80 % → 64 %, interpolated), second step ≥ 0.85 × the first confirms momentum, otherwise resume; decision on the frozen state (F1, F29, F30)
- [~] Flick from 40 % with ≥ 1.5 px/ms, measured as the fastest velocity since the last change of direction; flicking back always cancels
- [~] Idle timeout only as a fallback: 400 ms, so a short hold mid-swipe does not commit (F2)
- [~] Settling: momentum swallowed until a 150 ms pause; two rises in a row start a new gesture with the movement since the low point; a single jump does not (F18, F31, F34)
- [~] Vertical scrolling gives way to a clearly horizontal event after a pause or once it slowed down (F33)
- [x] Remove the obsolete constants (`SWIPE_COOLDOWN`, `MIN_VELOCITY_TO_ACTIVATE`, `DIRECTION_RATIO`, `GESTURE_IDLE_TIMEOUT`)
- [x] Realistic synthetic tests (F37); replay test for `test/fixtures/traces/` that runs once traces exist
- [ ] Fix the 3 failing tests (analysis and ideas in PLAN.md → Übergabe)
- [~] Fix F35, F36, F38, F39
- [ ] Tune the parameters with recorded traces until the replay tests pass
- [ ] Second review round by an independent subagent

### Phase 3: Safari-like feedback

Drafted in `src/SwipeIndicator.ts` and `src/SwipeIndicator.draft.css`, not wired into `main.ts` yet. Steps: PLAN.md → Übergabe → Phase 3 einbauen.

- [x] Draft: round indicator with an arrow icon that slides in from the edge of the swiped pane, with rubber-band resistance (F16)
- [x] Draft: short pop + accent fill when "ready" (hysteresis from Phase 2)
- [x] Draft: greyed out with strong resistance when there is no history
- [x] Draft: `SwipeIndicator` class with CSS variables + `transform`, updates batched per animation frame, icon created once, a new swipe takes over a running release animation (F17, F21)
- [x] Draft: respect `prefers-reduced-motion`
- [ ] Wire `SwipeIndicator` into `main.ts`, replace the indicator block in `styles.css`, delete the draft CSS file
- [~] Release timer on the swiped window (F36)
- [ ] Review by an independent subagent
- [ ] Check on the device: light and dark theme, reduced motion, split view, pop-out, no history
- [ ] Optional, not in this round: content follows slightly, new note slides in after navigating (F19)

### Phase 4: Release

- [ ] New plugin ID without "obsidian", e.g. `trackpad-swipe-navigation` (F24). Needs Robert's decision: the plugin folder, settings and trace path move
- [x] README, DEVELOPMENT.md, DISCLAIMER.md, manifest description (F25)
- [x] `minAppVersion` check: 1.0.0 still fits (newest API used: `setActiveLeaf(leaf, params)`, 0.16.3)
- [ ] Bump the version to 1.1.0 in `manifest.json`, `package.json` and `versions.json`
- [ ] Test matrix: macOS 60/120 Hz, natural scrolling on/off, Magic Mouse, Windows touchpad, mouse with Shift + wheel, split view, pop-out, Canvas, code block, modal, zoom other than 100 % (F28)
- [ ] Push, GitHub release (main.js, manifest.json, styles.css), PR to obsidian-releases
- [ ] Demo GIF (optional)

---

## v1.0 (archive)

### Phase 1: Initial Setup ✅

- [x] Create project structure
- [x] Setup TypeScript configuration
- [x] Setup build system (esbuild)
- [x] Create manifest.json
- [x] Write README with compatibility info
- [x] Migrate to Bun for faster builds
- [x] Create install-to-vault.sh script

### Phase 2: Core Implementation ✅

- [x] Test basic wheel event detection
- [x] Verify navigation commands work (`app:go-back`, `app:go-forward`)
- [x] Test on macOS trackpad
- [x] Test on Windows Precision Touchpad
- [x] Fine-tune sensitivity defaults (50 works well)

### Phase 3: Settings & UI ✅

- [x] Test settings tab functionality
- [x] Verify enable/disable toggle works
- [x] Test sensitivity slider
- [x] Add debug mode toggle for developers

### Phase 4: Code Quality ✅

- [x] Code review and refactoring
- [x] Remove unused constants
- [x] DRY navigation methods
- [x] Type-safe Obsidian commands
- [x] Error handling with user notifications
- [x] BEM CSS naming convention
- [x] Obsidian CSS variables

### Phase 5: Release Preparation ✅

- [x] Write detailed documentation (README, DEVELOPMENT.md)
- [x] Add versions.json for updates
- [x] Test on Windows

### Phase 6: Publishing (moved to v1.1 Phase 4)

- [ ] Push to GitHub repository
- [ ] Create GitHub Release (tag v1.0.0) with main.js, manifest.json, styles.css
- [ ] Submit PR to obsidian-releases (community-plugins.json)
- [ ] Create demo video/GIF (optional)

### Phase 7: Visual Feedback (Safari-Style) ✅

- [x] Add swipe state tracking (accumulate deltaX, detect swipe end via timeout)
- [x] Create visual indicator elements (edge bars with arrows)
- [x] Implement progressive visual feedback during swipe
- [x] Add cancel/commit logic (navigate only if threshold reached at swipe end)
- [x] CSS styles with Obsidian variables and smooth animations

### Answered Questions

1. **Command IDs**: `app:go-back` and `app:go-forward` are correct ✅
2. **Sensitivity**: 50 is a good default ✅
3. **Cooldown**: 300ms works well ✅
4. **Passive listener**: Passive is fine, no need for preventDefault() ✅

### Future Improvements (Post-Release)

- [x] Per-view enable/disable (e.g., disable in graph view) → v1.1 setting "Disabled in views"
- [ ] if not swiped far enough, set back → v1.1 Phase 2/3

## Resources

- [Obsidian Plugin API Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Feature Request: Two-finger swipe](https://forum.obsidian.md/t/two-finger-swipe-on-touchpad-to-go-back-go-forward-on-laptop-navigation-history/44414)
- [Feature Request: Mac navigation](https://forum.obsidian.md/t/improve-history-navigation-on-mac-os/19847)
