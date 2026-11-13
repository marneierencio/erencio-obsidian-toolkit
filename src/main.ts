import { addIcon, Plugin } from "obsidian";
import { FolderNaming, PluginInstaller } from "./plugins/installer";
import { CommunityRegistry } from "./plugins/registry";
import { TOOLBOX_ICON, ToolkitView, VIEW_TYPE_TOOLKIT } from "./ui/toolkit-view";

interface ToolkitSettings {
	folderNaming: FolderNaming;
}

const DEFAULT_SETTINGS: ToolkitSettings = {
	folderNaming: "manifest-id",
};

const TOOLBOX_SVG = `<g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
<path d="M36 28v-8a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v8"/>
<rect x="8" y="28" width="84" height="60" rx="8"/>
<path d="M8 54h84M34 46v16M66 46v16"/>
</g>`;

export default class ErencioToolkitPlugin extends Plugin {
	settings: ToolkitSettings = DEFAULT_SETTINGS;
	registry = new CommunityRegistry();
	installer!: PluginInstaller;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.installer = new PluginInstaller(this.app, this.manifest.id, () => this.settings.folderNaming);

		addIcon(TOOLBOX_ICON, TOOLBOX_SVG);
		this.registerView(VIEW_TYPE_TOOLKIT, (leaf) => new ToolkitView(leaf, this));
		this.addRibbonIcon(TOOLBOX_ICON, "Open Erencio Toolkit", () => void this.openView());
		this.addCommand({
			id: "open-toolkit",
			name: "Open toolkit",
			callback: () => void this.openView(),
		});
	}

	async openView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_TOOLKIT)[0];
		const leaf = existing ?? workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: VIEW_TYPE_TOOLKIT, active: true });
		await workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
