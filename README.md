# Swipe Navigation for Obsidian

Navigate back and forward through your note history using two-finger trackpad swipe gestures on desktop.

## Features

- **Two-finger swipe left** → Navigate back in history
- **Two-finger swipe right** → Navigate forward in history
- Adjustable sensitivity settings
- Easy enable/disable toggle
- Desktop-only (macOS, Windows, Linux)

## Why This Plugin?

Obsidian (being an Electron app) doesn't support native macOS/Windows trackpad gestures for navigation. This plugin brings that familiar browser-like navigation experience to Obsidian on desktop.

There are **many feature requests** from the community ([1](https://forum.obsidian.md/t/two-finger-swipe-on-touchpad-to-go-back-go-forward-on-laptop-navigation-history/44414), [2](https://forum.obsidian.md/t/improve-history-navigation-on-mac-os/19847)) asking for this functionality - this plugin solves that problem.

## Compatibility

| Platform | Support Level |
|----------|--------------|
| **macOS with Trackpad** | ✅ Excellent - Native two-finger swipe gestures work perfectly |
| **Windows Precision Touchpad** | ✅ Good - Modern laptops (Dell XPS, Surface, ThinkPad, etc.) |
| **Older Windows Trackpads** | ⚠️ Limited - May not work on budget/older laptops |
| **Linux** | ⚠️ Varies - Depends on trackpad driver and desktop environment |
| **Desktop with Mouse** | ❌ Not Supported - Requires trackpad for swipe gestures |

## Installation

### From Obsidian Community Plugins (when published)

1. Open Settings → Community Plugins
2. Search for "Swipe Navigation"
3. Click Install, then Enable

### Manual Installation (for development)

1. Download/clone this repository
2. Run `bun install` to install dependencies
3. Run `bun run build` to build the plugin
4. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-swipe-navigation/` folder
5. Reload Obsidian
6. Enable the plugin in Settings → Community Plugins

**Quick Install Script:**
```bash
./install-to-vault.sh /path/to/your/vault
```

## Development

This project uses [Bun](https://bun.sh) for faster builds and development.

```bash
# Install dependencies
bun install

# Start development mode (watches for changes and rebuilds)
bun run dev

# Build for production
bun run build

# Quick install to vault (builds and copies files)
./install-to-vault.sh /path/to/your/vault
```

### Testing

See [TEST.md](TEST.md) for comprehensive testing instructions and checklist.

## Settings

- **Enable swipe navigation**: Toggle the plugin on/off
- **Swipe sensitivity**: Adjust how far you need to swipe to trigger navigation (20-100, default: 50)

## How It Works

The plugin listens to `wheel` events from your trackpad and detects horizontal scrolling (`deltaX`). When a horizontal swipe exceeds the sensitivity threshold, it triggers Obsidian's native `app:go-back` or `app:go-forward` commands.

### Technical Details

- Uses `wheel` events with `deltaX` for horizontal gesture detection
- Includes cooldown mechanism (300ms) to prevent double-triggers
- Ignores events where vertical scrolling is dominant
- Uses `AbortController` for clean event listener cleanup
- Desktop-only (marked in manifest as `isDesktopOnly: true`)

## Limitations

1. **Hardware-dependent**: Quality varies based on trackpad hardware and drivers
2. **Not Magic Mouse**: macOS Magic Mouse gestures may behave differently than trackpad
3. **Electron limitation**: No access to native OS gesture APIs, relies on wheel events
4. **Horizontal scrolling conflict**: In rare cases, may interfere with intentional horizontal scrolling in graph view or wide tables

## Troubleshooting

**Swipes not working?**
- Check if your trackpad supports two-finger horizontal swipes
- Try adjusting sensitivity in settings
- Verify the plugin is enabled
- Check if you're using a Precision Touchpad (Windows Settings → Devices → Touchpad)

**Too sensitive / not sensitive enough?**
- Adjust the sensitivity slider in plugin settings
- Lower values = more sensitive
- Higher values = requires longer swipe

## Contributing

Contributions, bug reports, and feature requests are welcome!

## License

MIT

## Credits

Developed by Robert Stickler

Inspired by community feature requests and the mobile-only [Swipe Navigation plugin by Liam Cain](https://github.com/liamcain/obsidian-swipe-navigation).
