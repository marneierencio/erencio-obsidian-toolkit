import { apiVersion, App, normalizePath, PluginManifest } from "obsidian";
import { downloadRelease, fetchLatestRelease, ReleaseFiles } from "./github";
import { CommunityPlugin } from "./registry";
import { compareVersions } from "./version";

export type FolderNaming = "manifest-id" | "repository";

export interface UpdateInfo {
	id: string;
	name: string;
	repo: string;
	installed: string;
	latest: string;
}

/** Installs and updates community plugins from their GitHub release assets. */
export class PluginInstaller {
	constructor(
		private app: App,
		private selfId: string,
		private getFolderNaming: () => FolderNaming,
	) {}

	get pluginsDir(): string {
		return normalizePath(`${this.app.vault.configDir}/plugins`);
	}

	getInstalled(id: string): PluginManifest | undefined {
		return this.app.plugins.manifests[id];
	}

	isEnabled(id: string): boolean {
		return this.app.plugins.enabledPlugins.has(id);
	}

	/** Returns the latest version if it is newer than the installed one, otherwise null. */
	async checkUpdate(id: string, repo: string): Promise<string | null> {
		const installed = this.getInstalled(id);
		if (!installed) return null;
		const latest = await fetchLatestRelease(repo);
		return compareVersions(latest.version, installed.version) > 0 ? latest.version : null;
	}

	async install(entry: CommunityPlugin): Promise<PluginManifest> {
		if (this.getInstalled(entry.id)) throw new Error(`${entry.name} is already installed.`);
		const release = await this.download(entry);
		const folderName = this.getFolderNaming() === "repository" ? entry.repo.split("/")[1] : entry.id;
		const dir = normalizePath(`${this.pluginsDir}/${folderName}`);
		const adapter = this.app.vault.adapter;
		if (await adapter.exists(dir)) {
			throw new Error(`Folder "${dir}" already exists and does not belong to an installed plugin.`);
		}
		await adapter.mkdir(dir);
		await this.writeFiles(dir, release);
		await this.app.plugins.loadManifests();
		return release.manifest;
	}

	/** Updates an installed plugin in place, reloading it if it is enabled. */
	async update(entry: CommunityPlugin): Promise<{ from: string; to: string; reloaded: boolean }> {
		const installed = this.getInstalled(entry.id);
		if (!installed?.dir) throw new Error(`${entry.name} is not installed.`);
		const release = await this.download(entry);
		if (compareVersions(release.manifest.version, installed.version) <= 0) {
			return { from: installed.version, to: installed.version, reloaded: false };
		}
		await this.writeFiles(installed.dir, release);

		const wasEnabled = this.isEnabled(entry.id);
		// Reloading ourselves would kill the code that is running this update.
		const reload = wasEnabled && entry.id !== this.selfId;
		if (reload) await this.app.plugins.disablePlugin(entry.id);
		await this.app.plugins.loadManifests();
		if (reload) await this.app.plugins.enablePlugin(entry.id);
		return { from: installed.version, to: release.manifest.version, reloaded: reload };
	}

	async enable(id: string): Promise<void> {
		if (!this.app.plugins.isEnabled()) {
			throw new Error("Community plugins are turned off (restricted mode). Turn them on in Settings → Community plugins.");
		}
		const ok = await this.app.plugins.enablePluginAndSave(id);
		if (!ok) throw new Error(`Could not enable "${id}". Check the developer console for details.`);
	}

	private async download(entry: CommunityPlugin): Promise<ReleaseFiles> {
		const release = await downloadRelease(entry.repo, await fetchLatestRelease(entry.repo));
		if (release.manifest.id !== entry.id) {
			throw new Error(`Release manifest id "${release.manifest.id}" does not match "${entry.id}".`);
		}
		const minApp = release.manifest.minAppVersion;
		if (minApp && compareVersions(apiVersion, minApp) < 0) {
			throw new Error(`${entry.name} ${release.manifest.version} requires Obsidian ${minApp} or newer.`);
		}
		return release;
	}

	private async writeFiles(dir: string, release: ReleaseFiles): Promise<void> {
		const adapter = this.app.vault.adapter;
		await adapter.write(`${dir}/main.js`, release.main);
		await adapter.write(`${dir}/manifest.json`, release.manifestRaw);
		const stylesPath = `${dir}/styles.css`;
		if (release.styles !== null) {
			await adapter.write(stylesPath, release.styles);
		} else if (await adapter.exists(stylesPath)) {
			await adapter.remove(stylesPath);
		}
	}
}
