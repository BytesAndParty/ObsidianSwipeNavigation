#!/bin/bash

# Installation script for Swipe Navigation Plugin
# Usage: ./install-to-vault.sh /path/to/your/obsidian/vault

if [ -z "$1" ]; then
    echo "Usage: ./install-to-vault.sh /path/to/your/obsidian/vault"
    echo ""
    echo "Example:"
    echo "  ./install-to-vault.sh ~/Documents/MyVault"
    exit 1
fi

VAULT_PATH="$1"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/obsidian-swipe-navigation"

# Check if vault exists
if [ ! -d "$VAULT_PATH" ]; then
    echo "❌ Error: Vault not found at $VAULT_PATH"
    exit 1
fi

# Create plugin directory
echo "📁 Creating plugin directory..."
mkdir -p "$PLUGIN_DIR"

# Build the plugin first
echo "🔨 Building plugin..."
bun run build

if [ ! -f "main.js" ]; then
    echo "❌ Error: Build failed - main.js not found"
    exit 1
fi

# Copy files
echo "📋 Copying files..."
cp main.js "$PLUGIN_DIR/"
cp manifest.json "$PLUGIN_DIR/"
cp styles.css "$PLUGIN_DIR/"

echo ""
echo "✅ Plugin installed successfully!"
echo ""
echo "📍 Location: $PLUGIN_DIR"
echo ""
echo "Next steps:"
echo "1. Open Obsidian"
echo "2. Go to Settings → Community Plugins"
echo "3. Disable 'Restricted Mode' if needed"
echo "4. Enable 'Swipe Navigation'"
echo "5. Open Developer Console (Cmd+Opt+I or Ctrl+Shift+I)"
echo "6. Look for: [SwipeNavigation] Plugin loaded"
echo ""
echo "📖 See TEST.md for testing instructions"
