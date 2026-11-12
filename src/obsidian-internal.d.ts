// Typings for the undocumented parts of the Obsidian API used by this plugin.
// They are not part of the public API and may change between Obsidian releases.
import "obsidian";

declare module "obsidian" {
	interface App {
		plugins: {
			manifests: Record<string, PluginManifest>;
			plugins: Record<string, Plugin>;
			enabledPlugins: Set<string>;
			/** Whether community plugins are turned on (restricted mode off). */
			isEnabled(): boolean;
			loadManifests(): Promise<void>;
			enablePlugin(id: string): Promise<boolean>;
			enablePluginAndSave(id: string): Promise<boolean>;
			disablePlugin(id: string): Promise<void>;
		};
	}
}
