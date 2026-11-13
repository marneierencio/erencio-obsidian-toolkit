import { ItemView, Notice, Setting, WorkspaceLeaf } from "obsidian";
import type ErencioToolkitPlugin from "../main";
import { CommunityPlugin } from "../plugins/registry";
import { PluginBrowserModal } from "./browser-modal";

export const VIEW_TYPE_TOOLKIT = "erencio-toolkit-view";
export const TOOLBOX_ICON = "erencio-toolbox";

interface Tab {
	id: string;
	label: string;
	render: (el: HTMLElement) => void;
}

/** The main page of the toolkit, organised in tabs. */
export class ToolkitView extends ItemView {
	private activeTab = "main";
	private checking = false;

	private readonly tabs: Tab[] = [
		{ id: "main", label: "Main", render: (el) => this.renderMainTab(el) },
		{ id: "plugins", label: "Plugins", render: (el) => this.renderPluginsTab(el) },
	];

	constructor(leaf: WorkspaceLeaf, private plugin: ErencioToolkitPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TOOLKIT;
	}

	getDisplayText(): string {
		return "Erencio Toolkit";
	}

	getIcon(): string {
		return TOOLBOX_ICON;
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("et-view");

		const nav = root.createDiv("et-tabs");
		const body = root.createDiv("et-tab-content");
		for (const tab of this.tabs) {
			const button = nav.createEl("button", { cls: "et-tab", text: tab.label });
			if (tab.id === this.activeTab) {
				button.addClass("is-active");
				tab.render(body);
			}
			button.addEventListener("click", () => {
				this.activeTab = tab.id;
				this.render();
			});
		}
	}

	private renderMainTab(el: HTMLElement): void {
		el.createEl("h2", { text: "Erencio Obsidian Toolkit" });
		el.createEl("p", {
			text: "A collection of personal tools for Obsidian. Use the tabs above to reach each tool.",
		});
		el.createEl("p", { cls: "et-muted", text: `Version ${this.plugin.manifest.version}` });

		el.createEl("h3", { text: "Settings" });
		new Setting(el)
			.setName("Plugin folder name")
			.setDesc(
				"Folder used when installing by source-code. The manifest id matches what Obsidian itself uses, " +
				"so its built-in updater keeps working. The repository name may create a duplicate folder if the " +
				"plugin is later installed or updated by Obsidian.",
			)
			.addDropdown((dd) => dd
				.addOption("manifest-id", "Manifest id (recommended)")
				.addOption("repository", "Repository name")
				.setValue(this.plugin.settings.folderNaming)
				.onChange(async (value) => {
					this.plugin.settings.folderNaming = value as typeof this.plugin.settings.folderNaming;
					await this.plugin.saveSettings();
				}));
	}

	private renderPluginsTab(el: HTMLElement): void {
		new Setting(el).setName("Community plugins").setHeading();
		new Setting(el)
			.setName("Browse")
			.setDesc("Search community plugins and install them directly from their GitHub release assets.")
			.addButton((b) => b
				.setButtonText("Browse")
				.setCta()
				.onClick(() => new PluginBrowserModal(this.plugin).open()));

		new Setting(el).setName("Current plugins").setHeading();
		const results = createDiv("et-update-results");
		new Setting(el)
			.setName("Check for updates")
			.setDesc("Check every installed community plugin against its latest GitHub release and update the outdated ones.")
			.addButton((b) => b
				.setButtonText("Check for updates")
				.onClick(async () => {
					if (this.checking) return;
					this.checking = true;
					b.setDisabled(true);
					try {
						await this.checkAndUpdate(results);
					} finally {
						this.checking = false;
						b.setDisabled(false);
					}
				}));
		el.appendChild(results);
	}

	private async checkAndUpdate(el: HTMLElement): Promise<void> {
		const { installer, registry } = this.plugin;
		el.empty();
		const summary = el.createDiv({ cls: "et-muted", text: "Loading community plugin list..." });

		let list: CommunityPlugin[];
		try {
			list = await registry.load(true);
		} catch (err) {
			summary.setText(`Failed to load the plugin list: ${(err as Error).message}`);
			return;
		}
		const installed = list.filter((p) => installer.getInstalled(p.id));
		const skipped = Object.keys(this.app.plugins.manifests).length - installed.length;
		summary.setText(`Checking ${installed.length} plugins...`);

		const rows = el.createDiv("et-update-list");
		let updated = 0;
		let failed = 0;
		await runPool(installed, 4, async (p) => {
			try {
				const latest = await installer.checkUpdate(p.id, p.repo);
				if (!latest) return;
				const row = rows.createDiv({ cls: "et-update-row", text: `${p.name}: updating to ${latest}...` });
				const r = await installer.update(p);
				updated++;
				row.setText(`${p.name}: ${r.from} → ${r.to}${!r.reloaded && installer.isEnabled(p.id) ? " (reload Obsidian to apply)" : ""}`);
			} catch (err) {
				failed++;
				rows.createDiv({ cls: "et-update-row mod-error", text: `${p.name}: ${(err as Error).message}` });
			}
		});

		const parts = [updated ? `${updated} updated` : "All plugins are up to date"];
		if (failed) parts.push(`${failed} failed`);
		if (skipped > 0) parts.push(`${skipped} not in the community list (skipped)`);
		summary.setText(parts.join(" · ") + ".");
		new Notice(`Erencio Toolkit: ${parts.join(", ")}.`);
	}
}

async function runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
		while (next < items.length) await worker(items[next++]);
	});
	await Promise.all(lanes);
}
