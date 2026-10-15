# Swipe Navigation for Obsidian

Navigate back and forward through your note history with two-finger trackpad swipes on desktop, the way Safari does it.

## Features

- **Swipe with two fingers** to go back or forward in the note history
- **Safari-style feedback**: a round arrow slides in from the edge of the note as you swipe. Once it fills with the accent color, lifting your fingers navigates. Swipe back to cancel
- **Quick flicks** navigate too, even when they are short
- **The pane under the pointer** navigates, also in split view and pop-out windows, using that pane's own history
- **Stays out of the way**:
  - Wide code blocks and tables scroll first; swiping navigates only once they reach their edge
  - Canvas, graph view and Excalidraw are excluded by default (configurable)
  - No navigation over modals, menus or sidebars
  - Vertical and diagonal scrolling never navigates
  - Mouse wheels (including Shift + wheel and horizontal wheels) are ignored
- Desktop only (macOS, Windows, Linux)

### Three-finger swipes

On macOS, three-finger swipes are built into Obsidian and need no plugin: set "Swipe between pages" to "Swipe with three fingers" or "Swipe with two or three fingers" in System Settings → Trackpad → More Gestures.

## Why This Plugin?

Obsidian (being an Electron app) doesn't support two-finger trackpad swipes for navigation. This plugin brings that familiar browser-like navigation experience to Obsidian on desktop.

There are **many feature requests** from the community ([1](https://forum.obsidian.md/t/two-finger-swipe-on-touchpad-to-go-back-go-forward-on-laptop-navigation-history/44414), [2](https://forum.obsidian.md/t/improve-history-navigation-on-mac-os/19847)) asking for this functionality - this plugin solves that problem.

## Compatibility

| Device | Support |
|----------|--------------|
| **macOS trackpad** | ✅ Full support |
| **Windows Precision Touchpad** | ✅ Modern laptops (Dell XPS, Surface, ThinkPad, etc.) |
| **Older Windows trackpads** | ⚠️ Limited - may not work on budget/older laptops |
| **Linux** | ⚠️ Varies - depends on trackpad driver and desktop environment |
| **Magic Mouse** | ❔ Untested - Chromium reports it like a trackpad |
| **Mouse wheel** | ➖ Ignored on purpose |

## Installation

### From Obsidian Community Plugins (when published)

1. Open Settings → Community Plugins
2. Search for "Swipe Navigation"
3. Click Install, then Enable

### Manual Installation

1. Download/clone this repository
2. Run `bun install` to install dependencies
3. Run `bun run build` to build the plugin
4. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-swipe-navigation/` folder
5. Reload Obsidian
6. Enable the plugin in Settings → Community Plugins

## Settings

- **Enable swipe navigation**: Toggle the plugin on/off
- **Swipe sensitivity**: How far you need to swipe before lifting navigates (20-100, default 50; lower = shorter swipe)
- **Reverse swipe direction**: Swap back and forward, e.g. if natural scrolling is turned off
- **Disabled in views**: View types where swiping never navigates (default: `canvas, graph, localgraph, excalidraw`)
- **Debug mode**: Logs swipe decisions to the developer console and enables gesture recording (see [DEVELOPMENT.md](DEVELOPMENT.md))

## How It Works

Electron gives plugins no access to native trackpad gestures, so the plugin reads the `wheel` events a two-finger swipe produces:

1. At the start of each gesture it checks once whether the gesture may navigate at all: which pane is under the pointer, whether that view is excluded, whether the content there can still scroll horizontally, and whether the input looks like a mouse wheel.
2. After the first few pixels it locks the gesture to an axis. Vertical gestures are left alone.
3. While you swipe, the arrow follows the distance from the start point. Swiping back past the start point cancels.
4. Wheel events do not say when your fingers leave the trackpad, so the plugin infers it: smoothly slowing events are the trackpad's momentum after lifting, and a pause of 400 ms is the fallback. It then navigates if the arrow was filled or the swipe was a quick flick, and ignores the rest of the momentum.

## Limitations

1. **Lifting is inferred**, not reported by the system. A finger that slows down very evenly before swiping back can look like lifting. If you hold your fingers still and then lift, navigation waits for the 400 ms pause.
2. **Right after scrolling vertically**, a swipe is ignored until the scrolling has come to rest for a moment.
3. **Zoom**: at a zoom level other than 100 % the swipe distance changes with it.
4. **Mouse detection** is a heuristic: high-resolution mice, and mouse wheels at a zoom other than 100 %, may not be recognized.
5. **Hardware-dependent**: Quality varies with trackpad hardware and drivers.

## Troubleshooting

**Swipes go the wrong way?**
- Turn on "Reverse swipe direction" (needed with natural scrolling turned off)

**Swiping does nothing in a certain view?**
- Check "Disabled in views". With debug mode on, the developer console (Cmd+Opt+I) shows the view type when a swipe starts
- Over a wide table or code block, scroll it to its edge first

**Too sensitive / not sensitive enough?**
- Adjust the sensitivity slider: lower values need a shorter swipe

**Not working at all?**
- Check if your trackpad supports two-finger horizontal scrolling
- On Windows, check for a Precision Touchpad (Settings → Devices → Touchpad)

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md).

## Works Well with Other BytesAndParty Plugins

- [Command Overview](https://github.com/BytesAndParty/CommandOverview) - Swipe to navigate context, then execute commands from one keyboard-driven overlay.
- [Copy File Path](https://github.com/BytesAndParty/CopyFilePath) - Navigate to any note and immediately copy its system path.
- [Obsidian Recall](https://github.com/BytesAndParty/ObsidianRecall) - Fast back/forward history movement while jumping between cards and source notes.

## Contributing

Contributions, bug reports, and feature requests are welcome!

## License

MIT

## Credits

Developed by Robert Stickler

Inspired by community feature requests and the mobile-only [Swipe Navigation plugin by Liam Cain](https://github.com/liamcain/obsidian-swipe-navigation).
