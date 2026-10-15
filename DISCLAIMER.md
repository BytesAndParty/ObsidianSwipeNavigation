# Disclaimer & Technical Limitations

## How This Plugin Works

This plugin enables **two-finger trackpad swipe gestures** for navigating back and forward through your note history in Obsidian on desktop.

### Technical Implementation

Since Obsidian is built on Electron, it **does not have access to native OS trackpad gesture APIs**. Instead, this plugin:

1. Listens to `wheel` events from your trackpad
2. Detects horizontal scrolling (`deltaX`) caused by two-finger swipes
3. Infers when your fingers leave the trackpad (the trackpad's momentum or a short pause), because wheel events do not report it
4. Navigates the swiped pane's history if the swipe went far enough or was a quick flick, at most once per swipe

This is a **workaround**, not a native gesture implementation.

---

## Compatibility & Limitations

### ✅ What Works Well

**macOS Trackpads** (Best Experience)
- MacBook Pro/Air built-in trackpads
- Apple Magic Trackpad
- Consistent, reliable gesture detection
- Natural feel, similar to Safari/Chrome

**Windows Precision Touchpads** (Good Experience)
- Modern laptops from major manufacturers:
  - Dell XPS, Precision, Latitude
  - Microsoft Surface
  - Lenovo ThinkPad (newer models)
  - HP Spectre, EliteBook
  - Any laptop marketed with "Windows Precision Touchpad"
- Generally reliable, may require sensitivity adjustment

### ⚠️ Limited Support

**Older Windows Touchpads**
- Budget laptops or pre-2018 devices
- Touchpads without Precision Touchpad drivers
- May not send proper horizontal scroll events
- Often unreliable or non-functional

**Linux**
- Support varies wildly depending on:
  - Desktop environment (GNOME, KDE, etc.)
  - Touchpad drivers (libinput, synaptics)
  - Hardware manufacturer
- Some configurations work perfectly, others don't work at all

**Magic Mouse (macOS)**
- May behave differently than trackpad
- Less tested - your mileage may vary

### ❌ Does Not Work

**Desktop with Mouse Only**
- Requires a trackpad for swipe gestures
- Mouse wheel scrolling is not the same as a swipe

**Mobile Devices**
- This is a **desktop-only** plugin
- For mobile swipe navigation, use [Liam Cain's Mobile Swipe Plugin](https://github.com/liamcain/obsidian-swipe-navigation)

---

## Known Issues & Edge Cases

### Potential Conflicts

1. **Horizontal Scrolling Elements**
   - Wide tables and code blocks scroll first; a swipe only navigates once they reach their edge
   - Canvas, graph view and Excalidraw are excluded by default
   - Other views that pan with horizontal scrolling may still navigate. **Workaround**: add their view type to "Disabled in views" (debug mode shows it in the console)

2. **Diagonal Gestures**
   - Plugin ignores gestures that are more vertical than horizontal
   - If your swipe is too diagonal, it won't trigger
   - This is intentional to avoid interfering with normal scrolling

3. **Rapid Consecutive Swipes**
   - Each swipe navigates at most once, its momentum is ignored
   - A swipe started right after vertical scrolling is ignored until the scrolling has come to rest

### Why This Approach?

**Why not use native gesture APIs?**
- Electron doesn't expose native trackpad gesture events
- Web browsers have limited gesture support (mainly for pinch-zoom)
- Wheel events are the only cross-platform way to detect trackpad swipes

**Why not use a native Node module?**
- Would require platform-specific code for macOS/Windows/Linux
- Much more complex to maintain
- May break with Obsidian updates
- Community plugins can't use native Node modules easily

---

## Performance & Privacy

### Performance
- **Minimal overhead**: Only listens to wheel events
- **No polling**: Event-driven, runs only when you swipe
- **Clean cleanup**: Removes its listeners from every window on plugin unload
- **No memory leaks**: Properly cleans up all resources

### Privacy
- **No data collection**: Plugin doesn't track or send any data
- **No network requests**: 100% offline, no telemetry
- **No file access**: Only uses Obsidian's navigation commands
- **Open source**: All code is visible and auditable

---

## Recommendations

### For Best Experience

1. **macOS users**: This plugin should work perfectly out of the box
2. **Windows users**:
   - Check if you have a Precision Touchpad: Settings → Devices → Touchpad
   - Look for "Precision Touchpad" in the settings
   - If not listed, this plugin may not work well
3. **Linux users**: Try it and adjust sensitivity - results vary
4. **Sensitivity adjustment**:
   - Start with default (50)
   - If too sensitive → increase to 60-80
   - If not sensitive enough → decrease to 30-40

### When to Disable

Consider disabling this plugin if:
- A view you use often pans with horizontal scrolling and is not in "Disabled in views" yet
- You're using a desktop with mouse only
- Your trackpad doesn't support the feature well

---

## Support & Feedback

If the plugin doesn't work on your device:
1. Check your trackpad type (Precision Touchpad on Windows)
2. Try adjusting sensitivity settings
3. Verify Obsidian's navigation history works (try the back/forward buttons)
4. Check if other apps detect your trackpad swipes

**This is a best-effort implementation** given Electron's limitations. It works great on modern trackpads but can't work on all hardware.

---

## Alternative Solutions

If this plugin doesn't work for you:

1. **Keyboard shortcuts**:
   - `Cmd/Ctrl + [` for back
   - `Cmd/Ctrl + ]` for forward
2. **Mouse buttons**:
   - Many mice have side buttons that can be mapped to back/forward
3. **Command palette**:
   - Search for "Navigate back" or "Navigate forward"
4. **Toolbar buttons**:
   - Use the back/forward arrows in Obsidian's top bar

---

## License & Warranty

**MIT License** - Use at your own risk.

**No Warranty**: This plugin is provided "as is" without warranty of any kind. The developer is not responsible for any issues, data loss, or conflicts that may arise from using this plugin.

**Experimental**: This is a workaround for Electron's limitations. It may not work perfectly on all hardware configurations.
