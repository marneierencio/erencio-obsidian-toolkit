# Erencio Obsidian Toolkit

A personal toolkit for [Obsidian](https://obsidian.md). Click the toolbox icon in the ribbon (or run **Erencio Toolkit: Open toolkit**) to open the toolkit page.

## Features

### Plugins tab

- **Community plugins → Browse**: search the official community plugin list (with a *Show installed only* filter) and open a plugin's details and README.
  - **Install by source-code**: downloads `manifest.json`, `main.js` and `styles.css` from the plugin's latest GitHub release assets into `<vault>/.obsidian/plugins/<folder>`.
  - **Enable**: turns the plugin on right after installing.
  - **Update by source-code**: shown only when the latest release is newer than the installed version. Enabled plugins are reloaded after the update.
  - **Open in Obsidian's browser**: uninstall, options and the other actions live in Obsidian's own browser.
- **Current plugins → Check for updates**: checks every installed community plugin and updates the outdated ones.

### Main tab

- **Plugin folder name**: install into a folder named after the manifest id (default, same as Obsidian) or the GitHub repository name.

## Notes

- Like Obsidian's own installer, the latest version is read from `manifest.json` on the default branch and the files are downloaded from `github.com/<repo>/releases/download/<version>/`. If that release does not exist, the GitHub API (60 requests/hour) is used to find the latest release. Pre-releases are ignored.
- Enabling and reloading plugins uses undocumented Obsidian APIs (`app.plugins`) and may break in a future Obsidian version.

## Installation

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/marneierencio/erencio-obsidian-toolkit/releases/latest) into `<vault>/.obsidian/plugins/erencio-toolkit/`, then enable the plugin in **Settings → Community plugins**. Canary builds are published as the `canary` pre-release and can be installed with [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check + production build
```

Symlink or copy the repository into a test vault's `.obsidian/plugins/erencio-toolkit` folder.

### Branches and releases

| Branch / event | Workflow | Result |
| --- | --- | --- |
| Any pull request, push to `main`/`development` | `ci.yml` | Validate metadata, type-check, build |
| Pull request to / push on `development` | `canary.yml` | Rolling `canary` pre-release |
| Tag `x.y.z` | `release.yml` | Public release with the plugin assets |

To release: `npm version patch|minor|major` (updates `manifest.json` and `versions.json`), then `git push --follow-tags`.

### Repository protection

`main` and `development` only change through pull requests. The rules live in [`.github/rulesets`](.github/rulesets) and are applied once by a repository admin in **Settings → Rules → Rulesets → New ruleset → Import a ruleset**:

- `protected-branches.json`: no direct pushes, force pushes or deletion. Requires a pull request with a passing `build` check, an up-to-date branch, resolved conversations and code owner approval ([CODEOWNERS](.github/CODEOWNERS)). Repository admins may bypass the approval only when merging a pull request, never with a direct push.
- `release-tags.json`: `x.y.z` release tags cannot be moved or deleted.

Recommended in **Settings → Actions → General**: require approval for workflows from all external contributors, set *Workflow permissions* to *Read repository contents*, and leave *Allow GitHub Actions to create and approve pull requests* unchecked.

## License

[MIT](LICENSE)
