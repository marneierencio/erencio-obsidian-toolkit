import { PluginManifest, requestUrl } from "obsidian";

/**
 * Files Obsidian loads from a plugin folder. These are the assets published in a
 * plugin's GitHub release; any other asset (zips, source archives) is ignored.
 */
export interface ReleaseFiles {
	manifest: PluginManifest;
	manifestRaw: string;
	main: string;
	styles: string | null;
}

// Using the "releases/latest/download" redirect instead of the GitHub REST API
// avoids the 60 requests/hour unauthenticated rate limit.
function assetUrl(repo: string, file: string): string {
	return `https://github.com/${repo}/releases/latest/download/${file}`;
}

async function fetchAsset(repo: string, file: string, required: boolean): Promise<string | null> {
	const res = await requestUrl({ url: assetUrl(repo, file), throw: false });
	if (res.status === 404 && !required) return null;
	if (res.status >= 400) {
		throw new Error(`Could not download ${file} from ${repo} (HTTP ${res.status}).`);
	}
	return res.text;
}

/** Reads manifest.json from the latest release of a repository. */
export async function fetchLatestManifest(repo: string): Promise<PluginManifest> {
	const raw = await fetchAsset(repo, "manifest.json", true);
	return parseManifest(raw as string, repo);
}

/** Downloads every plugin file from the latest release of a repository. */
export async function fetchLatestRelease(repo: string): Promise<ReleaseFiles> {
	const [manifestRaw, main, styles] = await Promise.all([
		fetchAsset(repo, "manifest.json", true),
		fetchAsset(repo, "main.js", true),
		fetchAsset(repo, "styles.css", false),
	]);
	return {
		manifest: parseManifest(manifestRaw as string, repo),
		manifestRaw: manifestRaw as string,
		main: main as string,
		styles,
	};
}

/** Fetches the README of the default branch, or null if it has none. */
export async function fetchReadme(repo: string): Promise<string | null> {
	for (const name of ["README.md", "readme.md", "Readme.md"]) {
		const res = await requestUrl({ url: `https://raw.githubusercontent.com/${repo}/HEAD/${name}`, throw: false });
		if (res.status < 400) return res.text;
	}
	return null;
}

function parseManifest(raw: string, repo: string): PluginManifest {
	try {
		const manifest = JSON.parse(raw) as PluginManifest;
		if (!manifest.id || !manifest.version) throw new Error("missing id or version");
		return manifest;
	} catch (err) {
		throw new Error(`Invalid manifest.json in ${repo}: ${(err as Error).message}`);
	}
}
