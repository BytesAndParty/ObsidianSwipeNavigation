# TODO - Swipe Navigation Plugin

## Development Roadmap

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
- [ ] Test on Windows Precision Touchpad (pending)
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

### Phase 5: Release Preparation 🚧
- [x] Write detailed documentation (README, DEVELOPMENT.md)
- [x] Add versions.json for updates
- [ ] Test on Windows (pending)
- [ ] Create demo video/GIF (optional, post-release)
- [ ] Submit to Community Plugins (after Windows test)

## Testing Status

### macOS Testing ✅
- [x] MacBook trackpad - Works perfectly

### Windows Testing (Pending)
- [ ] Dell Precision laptop / Precision Touchpad

## Answered Questions

1. **Command IDs**: `app:go-back` and `app:go-forward` are correct ✅
2. **Sensitivity**: 50 is a good default ✅
3. **Cooldown**: 300ms works well ✅
4. **Passive listener**: Passive is fine, no need for preventDefault() ✅

## Future Improvements (Post-Release)

- [ ] Visual feedback animation when navigation occurs
- [ ] Per-view enable/disable (e.g., disable in graph view)
- [ ] Gesture customization
- [ ] Statistics/analytics

## Resources

- [Obsidian Plugin API Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Feature Request: Two-finger swipe](https://forum.obsidian.md/t/two-finger-swipe-on-touchpad-to-go-back-go-forward-on-laptop-navigation-history/44414)
- [Feature Request: Mac navigation](https://forum.obsidian.md/t/improve-history-navigation-on-mac-os/19847)
