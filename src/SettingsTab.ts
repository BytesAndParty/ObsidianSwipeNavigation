import { App, PluginSettingTab, Setting } from 'obsidian';
import type SwipeNavigationPlugin from './main';

export class SwipeNavigationSettingsTab extends PluginSettingTab {
	plugin: SwipeNavigationPlugin;

	constructor(app: App, plugin: SwipeNavigationPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Swipe Navigation Settings' });

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

		// Info section
		containerEl.createEl('h3', { text: 'How to use' });
		containerEl.createEl('p', {
			text: 'Use two-finger swipe left/right on your trackpad to navigate back and forward through your note history.'
		});

		containerEl.createEl('h3', { text: 'Compatibility' });
		const compatList = containerEl.createEl('ul');
		compatList.createEl('li', { text: '✅ macOS Trackpad - Excellent support' });
		compatList.createEl('li', { text: '✅ Windows Precision Touchpad - Good support' });
		compatList.createEl('li', { text: '⚠️ Older Windows Trackpads - Limited support' });
		compatList.createEl('li', { text: '❌ Desktop with mouse only - Not supported' });
	}
}
