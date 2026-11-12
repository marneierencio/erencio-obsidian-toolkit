import { Component, debounce, MarkdownRenderer, Modal, Notice, setIcon } from "obsidian";
import type ErencioToolkitPlugin from "../main";
import { fetchLatestManifest, fetchReadme } from "../plugins/github";
import { CommunityPlugin } from "../plugins/registry";
import { compareVersions } from "../plugins/version";

const PAGE_SIZE = 100;

/** Searchable list of community plugins with a details pane, like Obsidian's own browser. */
export class PluginBrowserModal extends Modal {
	private plugins: CommunityPlugin[] = [];
	private query = "";
	private installedOnly = false;
	private limit = PAGE_SIZE;
	private selected: CommunityPlugin | null = null;
	private renderToken = 0;
	private readmeComponent: Component | null = null;

	private browserEl!: HTMLElement;
	private listEl!: HTMLElement;
	private countEl!: HTMLElement;
	private detailEl!: HTMLElement;

	constructor(private plugin: ErencioToolkitPlugin) {
		super(plugin.app);
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass("et-browser-modal");
		this.titleEl.setText("Community plugins");

		this.browserEl = this.contentEl.createDiv("et-browser");
		const listPane = this.browserEl.createDiv("et-browser-list-pane");
		const detailPane = this.browserEl.createDiv("et-browser-detail-pane");

		const search = listPane.createEl("input", {
			type: "search",
			cls: "et-browser-search",
			attr: { placeholder: "Search community plugins..." },
		});
		search.addEventListener("input", debounce(() => {
			this.query = search.value.trim().toLowerCase();
			this.limit = PAGE_SIZE;
			this.renderList();
		}, 200, true));

		const toggle = listPane.createEl("label", { cls: "et-browser-toggle" });
		const checkbox = toggle.createEl("input", { type: "checkbox" });
		toggle.appendText(" Show installed only");
		checkbox.addEventListener("change", () => {
			this.installedOnly = checkbox.checked;
			this.limit = PAGE_SIZE;
			this.renderList();
		});

		this.countEl = listPane.createDiv("et-browser-count");
		this.listEl = listPane.createDiv("et-browser-list");

		const back = detailPane.createEl("button", { cls: "et-browser-back", text: "← Back" });
		back.addEventListener("click", () => this.browserEl.removeClass("et-show-detail"));
		this.detailEl = detailPane.createDiv("et-browser-detail");
		this.detailEl.createDiv({ cls: "et-muted", text: "Select a plugin to see its details." });

		search.focus();
		this.countEl.setText("Loading community plugin list...");
		try {
			this.plugins = await this.plugin.registry.load();
			this.renderList();
		} catch (err) {
			this.countEl.setText(`Failed to load the plugin list: ${(err as Error).message}`);
		}
	}

	onClose(): void {
		this.renderToken++;
		this.readmeComponent?.unload();
		this.contentEl.empty();
	}

	private filtered(): CommunityPlugin[] {
		const installer = this.plugin.installer;
		return this.plugins.filter((p) => {
			if (this.installedOnly && !installer.getInstalled(p.id)) return false;
			if (!this.query) return true;
			return `${p.name} ${p.author} ${p.description}`.toLowerCase().includes(this.query);
		});
	}

	private renderList(): void {
		const results = this.filtered();
		this.countEl.setText(`${results.length.toLocaleString()} plugins`);
		this.listEl.empty();
		for (const p of results.slice(0, this.limit)) {
			const item = this.listEl.createDiv("et-browser-item");
			if (this.selected?.id === p.id) item.addClass("is-selected");
			const header = item.createDiv("et-browser-item-name");
			header.createSpan({ text: p.name });
			if (this.plugin.installer.getInstalled(p.id)) {
				header.createSpan({ cls: "et-badge", text: "Installed" });
			}
			item.createDiv({ cls: "et-browser-item-author", text: `By ${p.author}` });
			item.createDiv({ cls: "et-browser-item-meta", text: `${p.downloads.toLocaleString()} downloads` });
			item.createDiv({ cls: "et-browser-item-desc", text: p.description });
			item.addEventListener("click", () => {
				this.listEl.querySelectorAll(".is-selected").forEach((el) => el.removeClass("is-selected"));
				item.addClass("is-selected");
				void this.showDetails(p);
			});
		}
		if (results.length > this.limit) {
			const more = this.listEl.createEl("button", { cls: "et-browser-more", text: "Show more" });
			more.addEventListener("click", () => {
				this.limit += PAGE_SIZE;
				this.renderList();
			});
		}
	}

	private async showDetails(p: CommunityPlugin): Promise<void> {
		this.selected = p;
		const token = ++this.renderToken;
		const stale = () => token !== this.renderToken;
		const installer = this.plugin.installer;
		this.browserEl.addClass("et-show-detail");

		this.readmeComponent?.unload();
		this.readmeComponent = new Component();
		this.readmeComponent.load();

		const el = this.detailEl;
		el.empty();
		el.createEl("h2", { text: p.name });
		const meta = el.createDiv("et-detail-meta");
		meta.createSpan({ text: `By ${p.author}` });
		meta.createSpan({ text: `${p.downloads.toLocaleString()} downloads` });
		meta.createEl("a", { text: "Repository", href: `https://github.com/${p.repo}` });
		el.createEl("p", { cls: "et-detail-desc", text: p.description });

		const versionEl = el.createDiv("et-detail-version");
		const actions = el.createDiv("et-detail-actions");
		const statusEl = el.createDiv("et-detail-status");

		const official = el.createDiv("et-detail-official");
		official.createSpan({
			text: "Uninstall, options, hotkeys and the other actions are available in Obsidian's own plugin browser. ",
		});
		const openOfficial = official.createEl("button", { text: "Open in Obsidian's browser" });
		openOfficial.addEventListener("click", () => {
			this.close();
			window.open(`obsidian://show-plugin?id=${encodeURIComponent(p.id)}`);
		});

		el.createEl("hr");
		const readmeEl = el.createDiv("et-detail-readme markdown-rendered");
		readmeEl.createDiv({ cls: "et-muted", text: "Loading README..." });

		const renderActions = async (): Promise<void> => {
			actions.empty();
			const installed = installer.getInstalled(p.id);
			versionEl.setText(installed ? `Installed: ${installed.version} · Latest: checking...` : "Latest: checking...");

			let latest: string | null = null;
			try {
				latest = (await fetchLatestManifest(p.repo)).version;
			} catch (err) {
				if (stale()) return;
				versionEl.setText(`${installed ? `Installed: ${installed.version} · ` : ""}Latest: unavailable`);
				statusEl.setText((err as Error).message);
			}
			if (stale()) return;
			if (latest) {
				versionEl.setText(`${installed ? `Installed: ${installed.version} · ` : ""}Latest: ${latest}`);
			}

			if (!installed) {
				this.actionButton(actions, "Install by source-code", "download", true, async () => {
					await installer.install(p);
					statusEl.setText("Installed. Enable it below, or later in Settings → Community plugins.");
				}, renderActions);
				return;
			}
			if (latest && compareVersions(latest, installed.version) > 0) {
				this.actionButton(actions, "Update by source-code", "refresh-cw", true, async () => {
					const r = await installer.update(p);
					statusEl.setText(r.reloaded || !installer.isEnabled(p.id)
						? `Updated ${r.from} → ${r.to}.`
						: `Updated ${r.from} → ${r.to}. Reload Obsidian to apply.`);
				}, renderActions);
			}
			if (!installer.isEnabled(p.id)) {
				this.actionButton(actions, "Enable", "power", false, async () => {
					await installer.enable(p.id);
					statusEl.setText("Enabled.");
				}, renderActions);
			} else {
				actions.createSpan({ cls: "et-muted", text: "Installed and enabled." });
			}
		};
		void renderActions();

		try {
			const readme = await fetchReadme(p.repo);
			if (stale()) return;
			readmeEl.empty();
			if (readme) {
				await MarkdownRenderer.render(this.app, readme, readmeEl, "", this.readmeComponent);
			} else {
				readmeEl.createDiv({ cls: "et-muted", text: "This repository has no README." });
			}
		} catch (err) {
			if (stale()) return;
			readmeEl.setText(`Could not load the README: ${(err as Error).message}`);
		}
	}

	private actionButton(
		parent: HTMLElement,
		label: string,
		icon: string,
		cta: boolean,
		action: () => Promise<void>,
		after: () => Promise<void>,
	): void {
		const button = parent.createEl("button", { cls: cta ? "mod-cta" : "" });
		setIcon(button.createSpan("et-button-icon"), icon);
		button.createSpan({ text: label });
		button.addEventListener("click", async () => {
			button.disabled = true;
			try {
				await action();
				this.renderList();
				await after();
			} catch (err) {
				new Notice((err as Error).message);
				button.disabled = false;
			}
		});
	}
}
