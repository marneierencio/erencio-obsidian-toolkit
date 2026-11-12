import { requestUrl } from "obsidian";

const RELEASES_BASE = "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD";

export interface CommunityPlugin {
	id: string;
	name: string;
	author: string;
	description: string;
	repo: string;
	downloads: number;
}

/** Lazily loads and caches the official community plugin list. */
export class CommunityRegistry {
	private cache: Promise<CommunityPlugin[]> | null = null;

	load(force = false): Promise<CommunityPlugin[]> {
		if (!this.cache || force) {
			this.cache = this.fetch().catch((err) => {
				this.cache = null;
				throw err;
			});
		}
		return this.cache;
	}

	async getById(id: string): Promise<CommunityPlugin | undefined> {
		return (await this.load()).find((p) => p.id === id);
	}

	private async fetch(): Promise<CommunityPlugin[]> {
		const [list, stats] = await Promise.all([
			requestUrl(`${RELEASES_BASE}/community-plugins.json`).json as Promise<Omit<CommunityPlugin, "downloads">[]>,
			(requestUrl(`${RELEASES_BASE}/community-plugin-stats.json`).json as Promise<Record<string, { downloads?: number }>>)
				.catch(() => ({} as Record<string, { downloads?: number }>)),
		]);
		return list
			.map((p) => ({ ...p, downloads: stats[p.id]?.downloads ?? 0 }))
			.sort((a, b) => b.downloads - a.downloads);
	}
}
