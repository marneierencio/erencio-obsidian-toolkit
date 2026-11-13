// Sanity checks for the release metadata. Exits non-zero on failure.
import { readFileSync } from "node:fs";

const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const manifest = read("manifest.json");
const pkg = read("package.json");
const versions = read("versions.json");
const errors = [];

for (const key of ["id", "name", "version", "minAppVersion", "description", "author"]) {
	if (!manifest[key]) errors.push(`manifest.json is missing "${key}"`);
}
if (/obsidian/i.test(manifest.id ?? "")) errors.push('manifest id must not contain "obsidian"');
if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) errors.push(`manifest version "${manifest.version}" is not x.y.z`);
if (manifest.version !== pkg.version) errors.push(`manifest (${manifest.version}) and package.json (${pkg.version}) versions differ`);
if (versions[manifest.version] !== manifest.minAppVersion) errors.push(`versions.json has no entry "${manifest.version}": "${manifest.minAppVersion}"`);

const tag = process.argv[2];
if (tag && tag !== manifest.version) errors.push(`tag "${tag}" does not match manifest version "${manifest.version}"`);

if (errors.length) {
	console.error(errors.map((e) => `✗ ${e}`).join("\n"));
	process.exit(1);
}
console.log(`✓ metadata valid (${manifest.id} ${manifest.version})`);
