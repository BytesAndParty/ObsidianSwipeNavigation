# TODO - Swipe Navigation Plugin

## v1.1 Rework: Bugs, Handling & Feel

Started 2026-10-14 after a code review. Findings are numbered F1–F25; the phases below reference them.

Legend: `[ ]` open · `[~]` implemented, waiting for a test on a real device · `[x]` done · `[-]` obsolete

**Root cause of most problems:** `wheel` events cannot tell "finger resting", "finger lifted" and "momentum" apart, so the 200 ms idle timeout is wrong in both directions (F1, F2). On top of that the plugin did not check *where* a swipe happens (F5–F9).

### Findings

#### Bugs

- [ ] **F1 Momentum delays and forces navigation.** After lifting, macOS keeps sending inertial wheel events for up to ~1 s. They extend the idle timer and add to the distance: navigation fires late, short swipes still trigger, cancelling barely works. → Phase 2
- [ ] **F2 Pausing mid-swipe commits.** Holding the fingers still for >200 ms counts as release; moving back afterwards starts a new gesture that may navigate the other way. → Phase 2
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

#### Handling & feel

- [ ] **F14 Activation needs one event with ≥25 px.** Depends on the refresh rate (120 Hz → half the delta per event); slow deliberate swipes never activate; deltas before activation are lost. → Phase 2
- [ ] **F15 No axis lock.** The 2.5:1 ratio is checked per event, so diagonal swipes flicker in and out. → Phase 2
- [ ] **F16 Weak indicator feedback.** Linear opacity (barely visible at 30 %), arrow only at 100 %, no resistance past the threshold, no hysteresis (ready state flickers), no feedback when there is no history. → Phase 3
- [ ] **F17 `animating` class stays for 250 ms**, so a gesture started right after the previous one lags behind. → Phase 3
- [ ] **F18 Cooldown silently drops a quick second swipe** although the indicator showed "ready". → Phase 2
- [ ] **F19 No transition after navigating**; content just swaps. → Phase 3 (optional)

#### Code & release

- [x] **F20 Deprecated `workspace.activeLeaf`.** No longer used; the pane comes from the event target.
- [ ] **F21 Inline styles and `querySelector` on every wheel event**; `width` forces layout. Use CSS variables + `transform`, batch per frame. → Phase 3
- [x] **F22 `log()` ignored debug mode.** Now only logs with debug mode on.
- [x] **F23 `h2` heading in the settings tab** (rejected in review). Uses `setHeading()` now.
- [ ] **F24 Plugin ID contains "obsidian"**, which the community submission check rejects. → Phase 4
- [ ] **F25 Stale docs.** README links the deleted `TEST.md` and `install-to-vault.sh`; `CLAUDE.md` points to a test vault that no longer exists. → Phase 4

### Phase 0: Measure

Tune with recorded input instead of guessing.

- [x] Gesture recorder (debug mode): commands "Start gesture recording" / "Stop gesture recording", scenario picker, "● REC" in the status bar (click to stop), trace JSON saved to `<vault>/.obsidian/plugins/obsidian-swipe-navigation/traces/`
- [x] Markers on the same clock: gesture start (accepted / rejected + reason), swipe activated, threshold, gesture end, navigate, file-open
- [x] `bun run analyze-traces <folder>`: one row per gesture (events, duration, Σdx/Σdy, max delta, event interval, zero-delta events, decaying tail, markers)
- [ ] Install the build in a test vault
- [ ] Record each scenario on the MacBook (also on an external 60 Hz display if available):
  - [ ] Swipe back: slow
  - [ ] Swipe back: quick flick
  - [ ] Swipe back: hold, then lift
  - [ ] Swipe back: cancel
  - [ ] Swipe forward
  - [ ] Vertical scrolling
  - [ ] Diagonal scrolling
  - [ ] Wide code block or table
  - [ ] Canvas panning
  - [ ] Mouse: Shift + wheel
  - [ ] Mouse: horizontal wheel
  - [ ] Three-finger swipe (expect exactly one `file-open` per swipe)
- [ ] Windows Precision Touchpad recordings (if a machine is available)
- [ ] Evaluate:
  - [ ] Does Chromium send a zero-delta event when the fingers lift? (`zero` column) That would be a real release signal.
  - [ ] Momentum tail: decay ratio per event and length, compared with finger movement
  - [ ] Do trackpad gestures ever start with a 120-multiple `wheelDeltaX`? (validates the F8 heuristic)
  - [ ] Deltas per event at 60 Hz vs. 120 Hz
- [ ] Copy representative traces to `test/fixtures/traces/` for the Phase 2 replay tests

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

- [ ] Extract a DOM-free `GestureRecognizer` and test it with the recorded traces (`bun test`)
- [ ] States: idle → tracking → swiping (axis locked) / rejected → commit / cancel → settle
- [ ] Axis lock after the first 10–20 px of total movement (F15)
- [ ] Activation by velocity in px/ms instead of a single-event delta; count the movement from the start of the gesture (F14)
- [ ] Momentum detection (smoothly decaying deltas, like the *Lethargy* library) = "fingers lifted": decide immediately, swallow the rest of the momentum (F1)
- [ ] Quick flick navigates below the distance threshold (like iOS)
- [ ] Idle timeout only as a fallback, value taken from the traces (F2)
- [ ] Cooldown only blocks repeats inside the same gesture; a deliberate second swipe still navigates (F18)

### Phase 3: Safari-like feedback

- [ ] Round indicator with an arrow icon that slides in with the finger, with rubber-band resistance (F16)
- [ ] Short pop + accent fill at the threshold; hysteresis (ready at 100 %, back off below ~85 %)
- [ ] Greyed out with strong resistance when there is no history
- [ ] CSS variables + `transform`, updates batched per animation frame, arrow element cached (F17, F21)
- [ ] Optional: content follows slightly, new note slides in after navigating; respect `prefers-reduced-motion` (F19)

### Phase 4: Release

- [ ] New plugin ID without "obsidian", e.g. `trackpad-swipe-navigation` (F24)
- [ ] README, manifest description, `CLAUDE.md` (vault path, structure) (F25)
- [ ] Bump version, `versions.json`, `minAppVersion` check
- [ ] Test matrix: macOS 60/120 Hz, natural scrolling on/off, Magic Mouse, Windows touchpad, mouse with Shift + wheel, split view, pop-out, Canvas, code block, modal
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
