import { App, PluginSettingTab, Setting } from 'obsidian';
import type SwipeNavigationPlugin from './main';
import type { SwipeMode } from './types';

export class SwipeNavigationSettingsTab extends PluginSettingTab {
	plugin: SwipeNavigationPlugin;

	constructor(app: App, plugin: SwipeNavigationPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('swipe-navigation-settings');

		containerEl.createEl('h2', { text: 'Swipe Navigation Settings' });

		// === Main Settings ===

		new Setting(containerEl)
			.setName('Enable swipe navigation')
			.setDesc('Turn on/off trackpad swipe gestures for navigation')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enabled)
				.onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Swipe mode')
			.setDesc('Two-finger: progressive swipe with visual feedback (all platforms). Three-finger: instant navigation (macOS only, requires "Swipe with three fingers" in System Settings > Trackpad).')
			.addDropdown(dropdown => dropdown
				.addOption('two-finger', 'Two-finger swipe')
				.addOption('three-finger', 'Three-finger swipe (macOS)')
				.setValue(this.plugin.settings.swipeMode)
				.onChange(async (value: string) => {
					this.plugin.settings.swipeMode = value as SwipeMode;
					await this.plugin.saveSettings();
					this.plugin.setupSwipeListener();
					// Re-render to show/hide sensitivity slider
					this.display();
				}));

		// Sensitivity only applies to two-finger mode
		if (this.plugin.settings.swipeMode === 'two-finger') {
			new Setting(containerEl)
				.setName('Swipe sensitivity')
				.setDesc('Minimum swipe distance to trigger navigation (lower = more sensitive)')
				.addSlider(slider => slider
					.setLimits(20, 100, 10)
					.setValue(this.plugin.settings.sensitivity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.sensitivity = value;
						await this.plugin.saveSettings();
					}));
		}

		// === Developer Settings ===

		containerEl.createEl('h3', { text: 'Developer' });

		new Setting(containerEl)
			.setName('Debug mode')
			.setDesc('Log swipe events and navigation to the developer console (Cmd+Opt+I)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				}));

		// === Info Section ===

		containerEl.createEl('h3', { text: 'How to use' });

		if (this.plugin.settings.swipeMode === 'two-finger') {
			containerEl.createEl('p', {
				text: 'Swipe left/right with two fingers on your trackpad to navigate back and forward through your note history. The edge indicator shows your progress — release when the arrow appears to navigate, or swipe back to cancel.'
			});
		} else {
			containerEl.createEl('p', {
				text: 'Swipe left/right with three fingers on your trackpad to navigate back and forward. Requires macOS with "Swipe between pages" set to "Swipe with three fingers" or "Swipe with two or three fingers" in System Settings > Trackpad > More Gestures.'
			});
		}

		containerEl.createEl('h3', { text: 'Compatibility' });
		const compatList = containerEl.createEl('ul');
		compatList.addClass('swipe-navigation-compat-list');
		compatList.createEl('li', { text: 'macOS Trackpad — Two-finger and three-finger modes' });
		compatList.createEl('li', { text: 'Windows Precision Touchpad — Two-finger mode only' });
		compatList.createEl('li', { text: 'Older Windows Trackpads — Limited support' });
		compatList.createEl('li', { text: 'Desktop with mouse only — Not supported' });
	}
}
