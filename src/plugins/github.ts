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

export interface LatestRelease {
	version: string;
	/** Git tag of the release, usually equal to the version. */
	tag: string;
}

class HttpError extends Error {
	constructor(public status: number, public url: string) {
		super(`HTTP ${status} from ${url}`);
	}
}

async function get(url: string, headers?: Record<string, string>): Promise<string> {
	const res = await requestUrl({ url, headers, throw: false });
	if (res.status >= 400) throw new HttpError(res.status, url);
	return res.text;
}

function releaseFileUrl(repo: string, tag: string, file: string): string {
	return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${file}`;
}

/** Latest release according to the GitHub API (rate limited to 60 requests/hour). */
async function latestFromApi(repo: string): Promise<LatestRelease> {
	const body = await get(`https://api.github.com/repos/${repo}/releases/latest`, {
		Accept: "application/vnd.github+json",
	});
	const tag = (JSON.parse(body) as { tag_name?: string }).tag_name;
	if (!tag) throw new Error(`No release found for ${repo}.`);
	return { tag, version: tag.replace(/^v/i, "") };
}

/**
 * Finds the latest released version of a plugin.
 *
 * Mirrors Obsidian's own installer: read the version from manifest.json on the
 * default branch and use it as the release tag. If that release does not exist
 * (the version was bumped but not released, or tags use a "v" prefix), falls back
 * to the GitHub API.
 */
export async function fetchLatestRelease(repo: string): Promise<LatestRelease> {
	try {
		const raw = await get(`https://raw.githubusercontent.com/${repo}/HEAD/manifest.json`);
		const { version } = parseManifest(raw, repo);
		const res = await requestUrl({ url: releaseFileUrl(repo, version, "manifest.json"), method: "HEAD", throw: false });
		if (res.status < 400) return { version, tag: version };
	} catch (err) {
		console.warn(`[erencio-toolkit] ${repo}: falling back to the GitHub API`, err);
	}
	try {
		return await latestFromApi(repo);
	} catch (err) {
		throw describe(err, `find the latest release of ${repo}`);
	}
}

interface ApiAsset {
	name: string;
	browser_download_url: string;
}

/**
 * Asset URLs of a release as listed by the GitHub API. These use the repository's
 * current name, so they skip the extra redirect GitHub adds for renamed or
 * transferred repositories. In some setups Obsidian's requestUrl gets HTTP 403
 * when a download goes through more than one redirect.
 */
async function assetUrlsFromApi(repo: string, tag: string): Promise<Map<string, string>> {
	const body = await get(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
		Accept: "application/vnd.github+json",
	});
	const assets = (JSON.parse(body) as { assets?: ApiAsset[] }).assets ?? [];
	return new Map(assets.map((a) => [a.name, a.browser_download_url]));
}

/** Downloads every plugin file of a release. */
export async function downloadRelease(repo: string, release: LatestRelease): Promise<ReleaseFiles> {
	let apiAssets: Promise<Map<string, string>> | null = null;
	const fetchFile = async (file: string, required: boolean): Promise<string | null> => {
		try {
			return await get(releaseFileUrl(repo, release.tag, file));
		} catch (err) {
			if (!required && err instanceof HttpError && err.status === 404) return null;
			if (!(err instanceof HttpError)) throw describe(err, `download ${file} of ${repo} ${release.tag}`);
			console.warn(`[erencio-toolkit] ${err.message}, retrying with the URL from the GitHub API`);
			try {
				apiAssets ??= assetUrlsFromApi(repo, release.tag);
				const url = (await apiAssets).get(file);
				if (!url) {
					if (!required) return null;
					throw new Error(`release ${release.tag} has no ${file} asset`);
				}
				return await get(url);
			} catch (retryErr) {
				throw describe(retryErr, `download ${file} of ${repo} ${release.tag} (first attempt: ${err.message})`);
			}
		}
	};
	const [manifestRaw, main, styles] = await Promise.all([
		fetchFile("manifest.json", true),
		fetchFile("main.js", true),
		fetchFile("styles.css", false),
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

/** Turns a failure into an error message that names the step and URL that failed. */
export function describe(err: unknown, action: string): Error {
	if (err instanceof HttpError) {
		const hint = err.status === 403 && err.url.includes("api.github.com")
			? " (GitHub API rate limit reached, try again later)"
			: "";
		return new Error(`Could not ${action}: ${err.message}${hint}`);
	}
	return new Error(`Could not ${action}: ${(err as Error).message}`);
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
