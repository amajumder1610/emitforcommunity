# EMIT — Embeddable Media Ingest Tool

Upload a video from your browser and get back a shareable GitHub Pages URL — no install, works the same on Windows and Mac since it's just a web page. There's no server: this page talks directly to the GitHub API using a personal access token you provide.

## 1. Create a GitHub personal access token

**Recommended: a fine-grained token scoped to one repository.** A classic token's `repo` scope grants access to *every* repo you can touch — if it ever leaks (shared device, browser extension, phishing), the blast radius is your whole account. A fine-grained token limited to one repo caps the damage to that repo, for however long the token is valid.

1. Create the target repository yourself first, on github.com (fine-grained tokens can't create new repos via the API — see the note below).
2. Go to [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) → **Generate new token**.
3. Under **Repository access**, choose **Only select repositories** and pick the one repo you just created.
4. Under **Permissions → Repository permissions**, set:
   - **Contents: Read and write**
   - **Pages: Read and write**
   (leave everything else as "No access" — `Metadata: Read-only` is included automatically).
5. Set the shortest expiration that's practical for how you'll use this (e.g. 7 or 30 days, not the 366-day max).
6. Generate it and copy the token — GitHub only shows it once.

**Why you must create the repo manually first:** GitHub's repo-creation endpoints only support classic tokens/OAuth, not fine-grained ones. If you connect EMIT to a repo that doesn't exist yet using a fine-grained token, repo creation will fail with a clear error telling you to create it yourself and reconnect.

**Alternative: a classic token**, if you want EMIT's "create the repo for me" step to work. Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**, check the **`repo`** scope, set an expiration. This is simpler but scopes to your entire account — only use it if you're comfortable with that trade-off, ideally on a token you delete again once you're done.

## 2. Use the tool

Open `index.html` in a browser (or visit it via wherever this repo is published on GitHub Pages).

1. **Paste your token** and click Connect.
2. **Enter an owner and repository name.** If the repo already exists, EMIT connects and enables GitHub Pages on it automatically (public repos only, on the free tier). If it doesn't exist and you're using a classic token, EMIT offers to create it for you; with a fine-grained token, create it yourself first and EMIT will tell you so clearly if it can't.
3. **Pick a video, give it a title** (and optional description), and click Upload.
4. Once both the video and its page are committed, EMIT shows the shareable URL. GitHub Pages can take a minute or two to finish building the first time — use the "Check if it's live" button if the link doesn't load right away.

### Running it locally

Some browsers (Chrome/Edge) block ES module imports from a plain `file://` path. If double-clicking `index.html` shows a blank page or console errors, either:
- publish this repo to GitHub Pages and use the hosted URL instead, or
- serve the `emit/` folder locally, e.g. `npx serve` or `python -m http.server`, then open the printed `http://localhost` URL.

If you're editing the code and a change doesn't seem to take effect, hard-refresh (or open DevTools → Network tab → "Disable cache") — plain static servers don't send strong cache-busting headers, so browsers can keep serving an old cached copy of `app.js` across reloads.

## Known limits (this is intentionally a thin layer over plain GitHub, not a video hosting service)

- **100MB per file** — GitHub's API rejects anything larger. EMIT blocks uploads above that and warns above 50MB.
- **~1GB per repository** is GitHub Pages' recommended source size, and **1GB is the hard cap on a published site** — at up to 100MB/video that's roughly 10 videos before a repo is full. Use a fresh repo for a new batch if you're getting close (EMIT shows the current repo size after connecting).
- **100GB/month** soft bandwidth limit and **10 builds/hour** soft limit on GitHub Pages.
- Private repos may require a paid GitHub plan for their Pages site to be publicly reachable — verify on your account if you create one as private.
- No Git LFS, no external video host — videos are committed straight into the repo, as-is.
- Your token is kept in `sessionStorage` (cleared when the tab closes) unless you check "remember on this device", which promotes it to `localStorage` on that browser only.
