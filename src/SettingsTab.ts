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
		containerEl.addClass('swipe-navigation-settings');

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

		new Setting(containerEl)
			.setName('Reverse swipe direction')
			.setDesc('Swap back and forward. Turn this on if swipes go the wrong way, e.g. with natural scrolling turned off.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.invertDirection)
				.onChange(async (value) => {
					this.plugin.settings.invertDirection = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Disabled in views')
			.setDesc('View types where swiping never navigates, separated by commas. With debug mode on, the developer console shows the view type when a swipe starts.')
			.addTextArea(text => text
				.setPlaceholder('canvas, graph')
				.setValue(this.plugin.settings.disabledViewTypes.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.disabledViewTypes = value
						.split(',')
						.map(viewType => viewType.trim())
						.filter(viewType => viewType.length > 0);
					await this.plugin.saveSettings();
				}));

		// === Developer Settings ===

		new Setting(containerEl).setName('Developer').setHeading();

		new Setting(containerEl)
			.setName('Debug mode')
			.setDesc('Log swipe decisions to the developer console (Cmd+Opt+I) and enable gesture recording: the commands "Start gesture recording" and "Stop gesture recording" save raw trackpad input as a trace file in the plugin folder.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				}));

		// === Info Section ===

		new Setting(containerEl).setName('How to use').setHeading();

		containerEl.createEl('p', {
			text: 'Swipe left/right with two fingers on your trackpad to navigate back and forward through the note history of the pane under the pointer. The edge indicator shows your progress — release when the arrow appears to navigate, or swipe back to cancel. Content that scrolls horizontally, like a wide table, scrolls first; swiping navigates once it has reached its edge.'
		});
		containerEl.createEl('p', {
			text: 'Three-finger swipes are built into Obsidian on macOS and need no plugin: set "Swipe between pages" to "Swipe with three fingers" or "Swipe with two or three fingers" in System Settings > Trackpad > More Gestures.'
		});

		new Setting(containerEl).setName('Compatibility').setHeading();
		const compatList = containerEl.createEl('ul');
		compatList.addClass('swipe-navigation-compat-list');
		compatList.createEl('li', { text: 'macOS Trackpad — Two-finger swipe' });
		compatList.createEl('li', { text: 'Windows Precision Touchpad — Two-finger swipe' });
		compatList.createEl('li', { text: 'Older Windows Trackpads — Limited support' });
		compatList.createEl('li', { text: 'Mouse wheel — Ignored on purpose' });
	}
}
