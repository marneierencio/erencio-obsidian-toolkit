/** Compares two version strings (semver-like). Returns -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
	const [aCore, aPre] = splitPre(a);
	const [bCore, bPre] = splitPre(b);
	const aParts = aCore.split(".").map((n) => parseInt(n, 10) || 0);
	const bParts = bCore.split(".").map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
		const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
		if (diff !== 0) return diff > 0 ? 1 : -1;
	}
	// A version without a pre-release tag is newer than one with it.
	if (aPre === bPre) return 0;
	if (!aPre) return 1;
	if (!bPre) return -1;
	return aPre.localeCompare(bPre, undefined, { numeric: true }) > 0 ? 1 : -1;
}

function splitPre(v: string): [string, string] {
	const clean = v.trim().replace(/^v/i, "").split("+")[0];
	const idx = clean.indexOf("-");
	return idx === -1 ? [clean, ""] : [clean.slice(0, idx), clean.slice(idx + 1)];
}
