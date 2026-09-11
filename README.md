# serve-diff

Review local Git changes in your browser. Built with React and [Pierre diffs](https://diffs.com), inspired by diffshub and [diffx](https://github.com/wong2/diffx).

## Setup

Requires **Node 26**, **pnpm 11**, and **Git**. From this checkout:

```sh
pnpm install
pnpm build
pnpm add -g .
```

This registers `serve-diff` globally, pointing to this checkout. Keep the checkout in place. If pnpm reports a missing global bin directory, run `pnpm setup`, restart your terminal, and retry.

## Usage

From any Git repository:

```sh
serve-diff .
```

serve-diff automatically opens the local address in your browser on macOS and
Linux, except in SSH sessions. Stop with **Ctrl+C**. The network address is
reachable by other devices on your local network.

```sh
serve-diff .                  # current repository
serve-diff /path/to/repo      # another repository
serve-diff . --port 4000      # different port
```

Subdirectories resolve to the repository root. Switch between all, staged, and unstaged changes; edits refresh automatically. Use the file tree to navigate and **+** beside a line to comment. **Copy unresolved** or **Copy all** exports agent-ready XML with instructions, short comment IDs, captured code context, and review provenance. Comments stay in your browser. The viewer never changes your Git files or index.

Or pipe Git output directly:

```sh
git diff | serve-diff
git show | serve-diff
git show main..HEAD~1 | serve-diff
git diff main HEAD~1 | serve-diff
serve-diff - < saved.patch
```

Piped or redirected input takes priority over a directory argument; an empty pipe opens an empty diff. Without input redirection, a directory is required. Piped diffs are fixed snapshots; re-run the command to update. Commit ranges show each commit separately, including repeated files. `git diff` between two refs shows their net difference. Standard Git patches up to 16 MiB total / 2 MiB per file are supported; use `git show --diff-merges=separate` for merge commits.

## Development

From this checkout:

```sh
pnpm dev:web
pnpm dev:server
```

Both development commands use `test/fixtures/sample.diff`. The web workspace
runs its own Vite fixture API; the server workspace runs the Node CLI with the
same diff piped to stdin.

Install Chromium once, then test either workspace independently or run every
check from the root:

```sh
pnpm test:browser:install
pnpm --filter @serve-diff/server test
pnpm --filter @serve-diff/web test
pnpm check
```

Run `pnpm build` after frontend changes, then restart `serve-diff`. No global reinstall needed.

UI work follows [DESIGN.md](DESIGN.md). Reuse semantic tokens in `apps/web/src/tokens.css` and typography in `apps/web/src/typography.css`; preserve Pierre's measured code geometry.

`App.tsx` composes the page sections. `app-state.tsx` owns shared state through `AppProvider`; `DiffWorkspace.tsx` owns Pierre rendering, and `use-review.ts` handles comment persistence. Section-only state stays with its component.
