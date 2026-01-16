# Testing Guide - Swipe Navigation Plugin

## Setup

1. **Install the plugin in Obsidian:**
   ```bash
   # Copy plugin files to your Obsidian vault's plugin folder
   # Example path: /path/to/your/vault/.obsidian/plugins/obsidian-swipe-navigation/

   # Copy these files:
   - main.js
   - manifest.json
   - styles.css
   ```

2. **Enable the plugin:**
   - Open Obsidian Settings → Community Plugins
   - Disable "Restricted Mode" if needed
   - Enable "Swipe Navigation"

3. **Open Developer Console:**
   - Press `Cmd+Opt+I` (macOS) or `Ctrl+Shift+I` (Windows)
   - Switch to "Console" tab to see debug logs

## Phase 2: Core Implementation Tests

### Test 1: Basic Wheel Event Detection

**Goal:** Verify that trackpad swipes are detected

**Steps:**
1. Open Obsidian with the plugin enabled
2. Open the developer console
3. Navigate between 2-3 notes to create history
4. Try swiping left/right on your trackpad (two-finger swipe)
5. Check the console for logs like:
   ```
   [SwipeNavigation] Wheel event: { deltaX: "XX.XX", deltaY: "XX.XX", threshold: 50, enabled: true }
   ```

**Expected Results:**
- ✅ Wheel events appear in console when swiping
- ✅ deltaX values are positive when swiping right
- ✅ deltaX values are negative when swiping left
- ✅ No events when scrolling vertically (deltaY should dominate)

**Status:** ⬜ Not Tested

---

### Test 2: Navigation Commands

**Goal:** Verify that navigation actually works

**Steps:**
1. Create 3-4 test notes in Obsidian
2. Navigate through them: Note A → Note B → Note C
3. Swipe LEFT (two fingers) on trackpad
4. Check console for: `[SwipeNavigation] Navigating BACK`
5. Verify you're back at Note B
6. Swipe RIGHT (two fingers)
7. Check console for: `[SwipeNavigation] Navigating FORWARD`
8. Verify you're back at Note C

**Expected Results:**
- ✅ Swipe left navigates back in history
- ✅ Swipe right navigates forward in history
- ✅ Console shows navigation messages
- ✅ No errors in console

**Status:** ⬜ Not Tested

---

### Test 3: Command ID Verification

**Goal:** Ensure we're using the correct Obsidian command IDs

**Steps:**
1. In Obsidian, press `Cmd+P` (macOS) or `Ctrl+P` (Windows)
2. Search for "back" - look for "Navigate back" command
3. Search for "forward" - look for "Navigate forward" command
4. Test using keyboard shortcuts (if available)
5. Compare behavior with swipe navigation

**Current Command IDs:**
- `app:go-back` - Navigate back
- `app:go-forward` - Navigate forward

**Expected Results:**
- ✅ Commands exist in command palette
- ✅ Swipe behavior matches command palette behavior
- ✅ No console errors about unknown commands

**Status:** ⬜ Not Tested

---

### Test 4: macOS Trackpad Testing

**Platform:** macOS

**Steps:**
1. Test on MacBook built-in trackpad
2. Test with Magic Trackpad (if available)
3. Try various swipe speeds (slow, medium, fast)
4. Try diagonal swipes (more horizontal than vertical)

**Expected Results:**
- ✅ All swipe speeds work reliably
- ✅ Diagonal swipes trigger navigation when horizontal component dominates
- ✅ No false positives during normal scrolling
- ✅ Sensitivity feels natural (not too sensitive, not too slow)

**Status:** ⬜ Not Tested

---

### Test 5: Windows Precision Touchpad Testing

**Platform:** Windows (Dell Precision laptop)

**Steps:**
1. Same as macOS trackpad test
2. Pay attention to deltaX values in console
3. Windows trackpads may have different sensitivity

**Expected Results:**
- ✅ Two-finger swipes are detected
- ✅ Navigation triggers reliably
- ✅ No conflicts with Windows gestures

**Status:** ⬜ Not Tested

---

### Test 6: Sensitivity Tuning

**Goal:** Find the optimal default sensitivity value

**Steps:**
1. Open plugin settings: Settings → Swipe Navigation
2. Set sensitivity to 20 (very sensitive)
3. Test - does it trigger too easily?
4. Set sensitivity to 100 (less sensitive)
5. Test - is it too hard to trigger?
6. Try values: 30, 40, 50, 60, 70
7. Note which feels most natural

**Current Default:** 50

**Expected Results:**
- ✅ Value of 50 works well for most users
- ✅ Lower values (20-30) work for light swipes
- ✅ Higher values (70-100) require more deliberate swipes
- ✅ Setting changes take effect immediately

**Recommended Value:** ___ (to be determined)

**Status:** ⬜ Not Tested

---

## Common Issues & Debugging

### Issue: No wheel events in console
**Possible causes:**
- Plugin not loaded properly
- Console filter hiding logs
- Trackpad not supported

**Debug:**
1. Check if plugin appears in Settings → Community Plugins
2. Look for `[SwipeNavigation] Plugin loaded` in console
3. Try refreshing Obsidian (Cmd+R / Ctrl+R)

---

### Issue: Events detected but navigation doesn't work
**Possible causes:**
- Wrong command IDs
- No navigation history
- Commands not available in current context

**Debug:**
1. Create history by navigating between notes first
2. Check for error messages in console
3. Test commands manually via command palette (Cmd+P)

---

### Issue: Too sensitive / not sensitive enough
**Solution:**
- Adjust sensitivity slider in settings
- Check console for deltaX values to see typical swipe magnitudes
- Default is 50, try values between 30-70

---

## Next Steps After Phase 2

Once all Phase 2 tests pass:
- [ ] Move to Phase 3: Settings & UI testing
- [ ] Move to Phase 4: Advanced testing (different views, edge cases)
- [ ] Document any issues found
- [ ] Update sensitivity defaults if needed
