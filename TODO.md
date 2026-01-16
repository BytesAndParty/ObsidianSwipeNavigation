# TODO - Swipe Navigation Plugin

## Development Roadmap

### Phase 1: Initial Setup ✅
- [x] Create project structure
- [x] Setup TypeScript configuration
- [x] Setup build system (esbuild)
- [x] Create manifest.json
- [x] Write README with compatibility info
- [x] **NEW:** Migrate to Bun for faster builds
- [x] **NEW:** Add debug logging for development
- [x] **NEW:** Create TEST.md with comprehensive test guide
- [x] **NEW:** Create DEVELOPMENT.md with dev documentation
- [x] **NEW:** Create install-to-vault.sh script

### Phase 2: Core Implementation 🚧
- [ ] Test basic wheel event detection (see TEST.md)
- [ ] Verify navigation commands work (`app:go-back`, `app:go-forward`)
- [ ] Test on macOS trackpad
- [ ] Test on Windows Precision Touchpad (Dell Precision)
- [ ] Fine-tune sensitivity defaults

### Phase 3: Settings & UI
- [ ] Test settings tab functionality
- [ ] Verify enable/disable toggle works
- [ ] Test sensitivity slider
- [ ] Add visual feedback when swipe is detected (optional)

### Phase 4: Testing & Polish
- [ ] Test in different Obsidian views (edit mode, reading mode, graph view)
- [ ] Test with horizontal scrolling elements (ensure no conflicts)
- [ ] Test cooldown mechanism (prevent double-triggers)
- [ ] Memory leak check (verify AbortController cleanup works)
- [ ] Test with different themes

### Phase 5: Release Preparation
- [ ] Write detailed documentation
- [ ] Create demo video/GIF
- [ ] Prepare for Community Plugin submission
- [ ] Add version.json for updates
- [ ] Test installation process

## Known Issues / Future Improvements

### Potential Issues to Watch
- **Horizontal scrolling conflict**: May interfere with graph view panning
  - Solution: Could add detection for specific views to disable
- **Magic Mouse behavior**: May work differently than trackpad
  - Solution: Test and document differences
- **Velocity detection**: Current implementation uses simple threshold
  - Improvement: Could add velocity/momentum detection for better UX

### Nice-to-Have Features (Future)
- [ ] Visual feedback animation when navigation occurs
- [ ] Per-view enable/disable (e.g., disable in graph view)
- [ ] Gesture customization (3-finger swipe, etc.)
- [ ] Statistics/analytics (how often used)
- [ ] Haptic feedback (if possible via Electron)

## Testing Checklist

### macOS Testing
- [ ] MacBook Pro trackpad
- [ ] Magic Trackpad
- [ ] Magic Mouse (if applicable)

### Windows Testing
- [ ] Dell Precision laptop (your device)
- [ ] Other Precision Touchpad devices (if available)

### Edge Cases
- [ ] Swipe while file is loading
- [ ] Swipe in Settings tab
- [ ] Swipe in graph view
- [ ] Swipe in canvas view
- [ ] Rapid consecutive swipes
- [ ] Diagonal swipes (more vertical than horizontal)

## Questions to Answer

1. **Command IDs**: Are `app:go-back` and `app:go-forward` the correct command IDs?
   - Need to verify in Obsidian's command palette or API docs

2. **Sensitivity**: Is 50 a good default, or should it be higher/lower?
   - Test with real usage to determine

3. **Cooldown**: Is 300ms the right cooldown time?
   - May need adjustment based on testing

4. **Passive listener**: Should wheel listener be passive or active?
   - Currently passive for performance, but may need to preventDefault() in some cases

## Resources

- [Obsidian Plugin API Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Feature Request: Two-finger swipe](https://forum.obsidian.md/t/two-finger-swipe-on-touchpad-to-go-back-go-forward-on-laptop-navigation-history/44414)
- [Feature Request: Mac navigation](https://forum.obsidian.md/t/improve-history-navigation-on-mac-os/19847)
- [Liam Cain's Mobile Swipe Plugin](https://github.com/liamcain/obsidian-swipe-navigation)
