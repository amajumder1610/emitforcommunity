# EMIT — Embeddable Media Ingest Tool

Upload a video from your browser and get back a shareable GitHub Pages URL — no install, works the same on Windows and Mac since it's just a web page. There's no server: this page talks directly to the GitHub API using a personal access token you provide.

## 1. Create a GitHub personal access token

Use a **classic** token, not fine-grained — GitHub's repo-creation endpoints don't support fine-grained tokens yet, and EMIT can create a repository for you if it doesn't already exist.

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token** → **Generate new token (classic)**.
2. Give it a name like `emit-tool`, set an expiration you're comfortable with.
3. Check the **`repo`** scope (this covers reading/creating repos, enabling Pages, and committing files).
4. Generate it and copy the token — GitHub only shows it once.

If you'd rather not grant repo-creation rights, a **fine-grained** token scoped to one existing repository with **Contents: Read & write** and **Administration: Read & write** permissions works fine too, as long as you always connect EMIT to a repo that already exists (skip the "create it" step).

## 2. Use the tool

Open `index.html` in a browser (or visit it via wherever this repo is published on GitHub Pages).

1. **Paste your token** and click Connect.
2. **Enter an owner and repository name.** If it doesn't exist yet, EMIT offers to create it (public by default — GitHub Pages needs that on the free tier to be publicly viewable). EMIT also enables GitHub Pages on it automatically.
3. **Pick a video, give it a title** (and optional description), and click Upload.
4. Once both the video and its page are committed, EMIT shows the shareable URL. GitHub Pages can take a minute or two to finish building the first time — use the "Check if it's live" button if the link doesn't load right away.

### Running it locally

Some browsers (Chrome/Edge) block ES module imports from a plain `file://` path. If double-clicking `index.html` shows a blank page or console errors, either:
- publish this repo to GitHub Pages and use the hosted URL instead, or
- serve the `emit/` folder locally, e.g. `npx serve` or `python -m http.server`, then open the printed `http://localhost` URL.

## Known limits (this is intentionally a thin layer over plain GitHub, not a video hosting service)

- **100MB per file** — GitHub's API rejects anything larger. EMIT blocks uploads above that and warns above 50MB.
- **~1GB per repository** is GitHub Pages' recommended source size, and **1GB is the hard cap on a published site** — at up to 100MB/video that's roughly 10 videos before a repo is full. Use a fresh repo for a new batch if you're getting close (EMIT shows the current repo size after connecting).
- **100GB/month** soft bandwidth limit and **10 builds/hour** soft limit on GitHub Pages.
- Private repos may require a paid GitHub plan for their Pages site to be publicly reachable — verify on your account if you create one as private.
- No Git LFS, no external video host — videos are committed straight into the repo, as-is.
- Your token is kept in `sessionStorage` (cleared when the tab closes) unless you check "remember on this device", which promotes it to `localStorage` on that browser only.
