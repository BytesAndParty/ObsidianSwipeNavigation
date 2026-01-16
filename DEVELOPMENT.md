# Development Guide

## Project Structure

```
obsidian-swipe-navigation/
├── src/
│   ├── main.ts              # Main plugin class
│   ├── types.ts             # Type definitions and constants
│   └── SettingsTab.ts       # Settings UI
├── manifest.json            # Plugin metadata
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── esbuild.config.mjs       # Build configuration
├── styles.css               # Plugin styles (currently empty)
├── README.md                # User documentation
├── TODO.md                  # Development roadmap
├── TEST.md                  # Testing guide
├── DEVELOPMENT.md           # This file
└── install-to-vault.sh      # Quick installation script
```

## Quick Start

```bash
# Install bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Start development
bun run dev

# In another terminal, install to your vault
./install-to-vault.sh ~/path/to/vault

# Reload Obsidian (Cmd+R or Ctrl+R)
```

## Development Workflow

### 1. Make Changes
Edit files in `src/` directory.

### 2. Build Automatically
If you're running `bun run dev`, the plugin rebuilds automatically on file changes.

### 3. Test in Obsidian
- Reload Obsidian with `Cmd+R` (macOS) or `Ctrl+R` (Windows)
- Open Developer Tools: `Cmd+Opt+I` (macOS) or `Ctrl+Shift+I` (Windows)
- Check console for logs: `[SwipeNavigation]` prefix

### 4. Iterate
Make changes → Auto-rebuild → Reload Obsidian → Test

## Build System

We use **esbuild** for fast bundling:

- **Development mode**: `bun run dev`
  - Watches for file changes
  - Includes inline source maps
  - Fast rebuilds

- **Production mode**: `bun run build`
  - Single build
  - No source maps
  - Tree-shaking enabled
  - TypeScript type checking included

## Debug Logging

The plugin includes debug logs for development:

```typescript
// Wheel events (only when significant movement detected)
console.log('[SwipeNavigation] Wheel event:', {
  deltaX: horizontalDelta.toFixed(2),
  deltaY: event.deltaY.toFixed(2),
  threshold: this.settings.sensitivity,
  enabled: this.settings.enabled
});

// Navigation actions
console.log('[SwipeNavigation] Navigating BACK');
console.log('[SwipeNavigation] Navigating FORWARD');

// Cooldown blocks
console.log('[SwipeNavigation] Navigate back blocked by cooldown');
```

### Viewing Logs

1. Open Obsidian Developer Tools
2. Go to Console tab
3. Filter by `SwipeNavigation` if needed
4. Look for wheel events when swiping

## Key Files Explained

### src/main.ts
The main plugin class that:
- Sets up wheel event listeners
- Detects horizontal swipes
- Triggers navigation commands
- Manages settings

**Key methods:**
- `onload()` - Plugin initialization
- `onunload()` - Cleanup
- `setupSwipeListener()` - Event listener setup
- `handleWheelEvent()` - Swipe detection logic
- `navigateBack()` / `navigateForward()` - Navigation execution

### src/types.ts
Type definitions and constants:
- `SwipeNavigationSettings` interface
- `DEFAULT_SETTINGS` (sensitivity: 50, enabled: true)
- `SWIPE_COOLDOWN` (300ms between swipes)

### src/SettingsTab.ts
Settings UI with:
- Enable/disable toggle
- Sensitivity slider (20-100)
- Usage instructions
- Compatibility info

## Testing Checklist

See [TEST.md](TEST.md) for comprehensive testing guide.

**Quick test:**
1. Install plugin to a vault
2. Create 3 notes and navigate between them
3. Open Developer Console
4. Swipe left (2 fingers) → should navigate back
5. Swipe right (2 fingers) → should navigate forward
6. Check console for logs

## Common Development Tasks

### Add a new setting

1. Update `SwipeNavigationSettings` interface in `src/types.ts`
2. Update `DEFAULT_SETTINGS` in `src/types.ts`
3. Add UI control in `src/SettingsTab.ts`
4. Use the setting in `src/main.ts`

### Change navigation behavior

Edit `handleWheelEvent()` in `src/main.ts`:
- Modify threshold logic
- Add new gesture detection
- Filter specific views

### Add visual feedback

1. Add CSS to `styles.css`
2. Create DOM elements in `src/main.ts`
3. Trigger animations on swipe

## Troubleshooting Development Issues

### Build fails with "module not found"
```bash
bun install  # Reinstall dependencies
```

### Changes not appearing in Obsidian
1. Check if dev mode is running
2. Reload Obsidian (Cmd+R / Ctrl+R)
3. Check console for errors
4. Verify files copied to `.obsidian/plugins/`

### TypeScript errors
```bash
bun tsc --noEmit  # Check types without building
```

### Plugin not loading
1. Check manifest.json is valid JSON
2. Verify plugin is enabled in Settings
3. Check for console errors on Obsidian startup
4. Look for `[SwipeNavigation] Plugin loaded`

## Advanced Topics

### Event Listener Performance

The wheel listener uses:
- `{ passive: true }` - Can't prevent default, but better performance
- `AbortController` - Clean cleanup on unload

If you need to preventDefault():
```typescript
// Change to passive: false
document.addEventListener('wheel', handler, { signal, passive: false });

// Then you can:
event.preventDefault();
```

### Cooldown Mechanism

Prevents double-triggers:
```typescript
private lastSwipeTime: number = 0;

// Check if enough time passed
if (now - this.lastSwipeTime < SWIPE_COOLDOWN) {
  return; // Block
}
this.lastSwipeTime = now;
```

Adjust `SWIPE_COOLDOWN` in `src/types.ts` if needed.

### Command Execution

We use Obsidian's internal command system:
```typescript
// @ts-ignore - app.commands not in official types
this.app.commands.executeCommandById('app:go-back');
```

**Finding command IDs:**
1. Open Obsidian Developer Tools
2. Run: `app.commands.listCommands()`
3. Search output for command names

## Release Process

When ready to release:

1. **Update version**
   ```bash
   # Update version in manifest.json and package.json
   ```

2. **Build production**
   ```bash
   bun run build
   ```

3. **Test thoroughly**
   - Follow [TEST.md](TEST.md) checklist
   - Test on multiple platforms
   - Test all settings

4. **Create release**
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

5. **Prepare release files**
   - `main.js`
   - `manifest.json`
   - `styles.css`

6. **Submit to Obsidian Community Plugins**
   - Follow official submission guidelines
   - Include README with clear instructions

## Resources

- [Obsidian Plugin API Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Home)
- [Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Bun Documentation](https://bun.sh/docs)
- [esbuild Documentation](https://esbuild.github.io/)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Questions?

Check the TODO.md for known issues and future improvements.
