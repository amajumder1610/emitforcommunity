import { createGitHubClient, GitHubApiError } from './github-api.js';
import { slugify, withSuffix } from './slug.js';
import { encodeFileToBase64, encodeTextToBase64 } from './base64.js';
import { buildVideoPageHtml } from './video-page-template.js';

const TOKEN_STORAGE_KEY = 'emit.github.token';
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const WARN_FILE_BYTES = 50 * 1024 * 1024;
const PAGES_SOFT_LIMIT_MB = 1024;

const el = (id) => document.getElementById(id);

const tokenInput = el('token-input');
const tokenToggle = el('token-toggle');
const tokenRemember = el('token-remember');
const tokenConnectBtn = el('token-connect');
const tokenStatus = el('token-status');

const repoSection = el('section-repo');
const repoOwnerInput = el('repo-owner');
const repoNameInput = el('repo-name');
const repoPrivateCheckbox = el('repo-private');
const repoConnectBtn = el('repo-connect');
const repoStatus = el('repo-status');
const repoSizeEl = el('repo-size');

const uploadSection = el('section-upload');
const videoTitleInput = el('video-title');
const videoDescriptionInput = el('video-description');
const videoFileInput = el('video-file');
const videoFileInfo = el('video-file-info');
const videoUploadBtn = el('video-upload');
const uploadStatus = el('upload-status');

const resultSection = el('section-result');
const resultUrlInput = el('result-url');
const resultCopyBtn = el('result-copy');
const resultNote = el('result-note');
const resultOpenLink = el('result-open');
const resultRecheckBtn = el('result-recheck');

let client = null;
let authUser = null;
let connectedRepo = null; // { owner, repoName, defaultBranch, pagesUrl }

function setStatus(target, message, kind = 'info') {
  target.textContent = message;
  target.classList.remove('error', 'success');
  if (kind === 'error' || kind === 'success') target.classList.add(kind);
}

function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function getFileExtension(file) {
  const nameMatch = /\.([a-z0-9]+)$/i.exec(file.name || '');
  if (nameMatch) return nameMatch[1].toLowerCase();
  const mimeMatch = /^video\/([a-z0-9]+)$/i.exec(file.type || '');
  if (mimeMatch) return mimeMatch[1].toLowerCase();
  return 'bin';
}

function describeError(err) {
  if (err instanceof GitHubApiError) {
    if (err.isNetworkError) return err.message;
    if (err.status === 401) return 'That token was rejected by GitHub (invalid or expired). Generate a new one and try again.';
    if (err.retryAfterSeconds) return `${err.githubMessage || 'Rate limited by GitHub.'} Try again in about ${err.retryAfterSeconds}s.`;
    return err.githubMessage || err.message;
  }
  return err?.message || String(err);
}

function loadStoredToken() {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

function storeToken(token, remember) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  if (remember) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function connectToken(token, { silent = false } = {}) {
  if (!token) {
    setStatus(tokenStatus, 'Paste a personal access token first.', 'error');
    return;
  }
  setBusy(tokenConnectBtn, true, 'Connecting…', 'Connect');
  if (!silent) setStatus(tokenStatus, 'Connecting…');
  try {
    const candidateClient = createGitHubClient(token);
    const user = await candidateClient.getAuthenticatedUser();
    client = candidateClient;
    authUser = user;
    storeToken(token, tokenRemember.checked);
    setStatus(tokenStatus, `Connected as ${user.login}.`, 'success');
    repoOwnerInput.value = repoOwnerInput.value || user.login;
    repoSection.hidden = false;
  } catch (err) {
    client = null;
    authUser = null;
    setStatus(tokenStatus, describeError(err), 'error');
  } finally {
    setBusy(tokenConnectBtn, false, 'Connecting…', 'Connect');
  }
}

tokenToggle.addEventListener('click', () => {
  const showing = tokenInput.type === 'text';
  tokenInput.type = showing ? 'password' : 'text';
  tokenToggle.textContent = showing ? 'Show' : 'Hide';
});

tokenConnectBtn.addEventListener('click', () => connectToken(tokenInput.value.trim()));

async function ensurePagesReady(owner, repoName, defaultBranch) {
  let pages = await client.getPagesInfo(owner, repoName);

  if (!pages) {
    pages = await client.enablePages(owner, repoName, defaultBranch, '/');
    setStatus(repoStatus, 'Repository connected. GitHub Pages was just enabled — the first build can take a couple of minutes.', 'success');
  } else if (pages.build_type === 'workflow') {
    throw new Error(
      "This repo's GitHub Pages is configured for a custom GitHub Actions workflow, which EMIT doesn't support. Reconfigure Pages to deploy from a branch, or connect a different repo."
    );
  } else if (pages.source && pages.source.branch !== defaultBranch) {
    setStatus(
      repoStatus,
      `Connected, but heads up: Pages is currently serving the "${pages.source.branch}" branch, not "${defaultBranch}" — new uploads may not show up until that's reconciled.`,
      'error'
    );
  } else {
    setStatus(repoStatus, 'Repository connected. GitHub Pages is already enabled.', 'success');
  }

  const nojekyll = await client.getFileMeta(owner, repoName, '.nojekyll');
  if (!nojekyll) {
    await client.putFileContents(owner, repoName, '.nojekyll', {
      message: 'Add .nojekyll (disable Jekyll processing)',
      contentBase64: '',
      branch: defaultBranch,
    });
  }

  return pages;
}

async function connectRepo(owner, repoName, makePrivate) {
  if (!client) {
    setStatus(repoStatus, 'Connect a token first.', 'error');
    return;
  }
  if (!owner || !repoName) {
    setStatus(repoStatus, 'Enter both an owner and a repository name.', 'error');
    return;
  }

  setBusy(repoConnectBtn, true, 'Connecting…', 'Connect / create');
  setStatus(repoStatus, 'Checking repository…');
  try {
    let repo = await client.getRepo(owner, repoName);

    if (!repo) {
      if (owner.toLowerCase() === authUser.login.toLowerCase()) {
        setStatus(repoStatus, 'Repository not found — creating it…');
        repo = await client.createUserRepo(repoName, { isPrivate: makePrivate });
      } else {
        const accountType = await client.getAccountType(owner);
        if (accountType === 'Organization') {
          setStatus(repoStatus, 'Repository not found — creating it in that organization…');
          repo = await client.createOrgRepo(owner, repoName, { isPrivate: makePrivate });
        } else if (accountType === 'User') {
          throw new Error(`"${owner}" is another user's account — repos can only be created under your own account or an organization you belong to.`);
        } else {
          throw new Error(`Couldn't find a GitHub user or organization named "${owner}".`);
        }
      }
    }

    setStatus(repoStatus, 'Repository ready. Checking GitHub Pages…');
    const pages = await ensurePagesReady(owner, repo.name, repo.default_branch);

    connectedRepo = {
      owner,
      repoName: repo.name,
      defaultBranch: repo.default_branch,
      pagesUrl: pages.html_url,
    };

    const sizeMb = (repo.size || 0) / 1024;
    repoSizeEl.textContent = `Repo size: ~${sizeMb.toFixed(1)} MB of the ~${PAGES_SOFT_LIMIT_MB} MB GitHub Pages source-repo guideline.`;

    uploadSection.hidden = false;
  } catch (err) {
    setStatus(repoStatus, describeError(err), 'error');
  } finally {
    setBusy(repoConnectBtn, false, 'Connecting…', 'Connect / create');
  }
}

repoConnectBtn.addEventListener('click', () =>
  connectRepo(repoOwnerInput.value.trim(), repoNameInput.value.trim(), repoPrivateCheckbox.checked)
);

videoFileInput.addEventListener('change', () => {
  const file = videoFileInput.files[0];
  if (!file) {
    videoFileInfo.textContent = '';
    return;
  }
  videoFileInfo.textContent = `${file.name} — ${formatBytes(file.size)}`;
  if (!videoTitleInput.value) {
    videoTitleInput.value = file.name.replace(/\.[^.]+$/, '');
  }
});

async function findFreeSlug(owner, repoName, baseSlug, ext) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const candidate = withSuffix(baseSlug, attempt);
    const [videoMeta, pageMeta] = await Promise.all([
      client.getFileMeta(owner, repoName, `media/${candidate}/video.${ext}`),
      client.getFileMeta(owner, repoName, `media/${candidate}/index.html`),
    ]);
    if (!videoMeta && !pageMeta) return { slug: candidate, resumeVideoOnly: false };
    if (videoMeta && !pageMeta) return { slug: candidate, resumeVideoOnly: true };
  }
  throw new Error('Could not find an available URL slug for this title — try a more specific title.');
}

function showResult(url, owner, repoName) {
  resultSection.hidden = false;
  resultUrlInput.value = url;
  resultOpenLink.href = url;
  resultNote.textContent = "GitHub Pages can take a minute or two to build after the first upload. If the link 404s at first, wait a bit and check again.";
  resultSection.dataset.owner = owner;
  resultSection.dataset.repoName = repoName;
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function uploadVideo(title, description, file) {
  if (!connectedRepo) {
    setStatus(uploadStatus, 'Connect a repository first.', 'error');
    return;
  }
  if (!file) {
    setStatus(uploadStatus, 'Choose a video file first.', 'error');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setStatus(uploadStatus, `That file is ${formatBytes(file.size)} — GitHub's API caps individual files at 100MB. Trim the video and try again.`, 'error');
    return;
  }

  const effectiveTitle = title || file.name.replace(/\.[^.]+$/, '');
  const ext = getFileExtension(file);
  const { owner, repoName, defaultBranch, pagesUrl } = connectedRepo;

  setBusy(videoUploadBtn, true, 'Uploading…', 'Upload');
  try {
    if (file.size > WARN_FILE_BYTES) {
      setStatus(uploadStatus, `Heads up: ${formatBytes(file.size)} is a large file for this tool — it may be slow to encode/upload.`);
    }

    const baseSlug = slugify(effectiveTitle);
    const { slug, resumeVideoOnly } = await findFreeSlug(owner, repoName, baseSlug, ext);
    const videoPath = `media/${slug}/video.${ext}`;
    const pagePath = `media/${slug}/index.html`;

    if (!resumeVideoOnly) {
      setStatus(uploadStatus, 'Encoding video…');
      const contentBase64 = await encodeFileToBase64(file, (fraction) => {
        setStatus(uploadStatus, `Encoding video… ${Math.round(fraction * 100)}%`);
      });
      setStatus(uploadStatus, 'Uploading video to GitHub…');
      await client.putFileContents(owner, repoName, videoPath, {
        message: `Add video: ${effectiveTitle}`,
        contentBase64,
        branch: defaultBranch,
      });
    } else {
      setStatus(uploadStatus, 'Video already uploaded from a previous attempt — finishing the page…');
    }

    setStatus(uploadStatus, 'Publishing page…');
    const pageHtml = buildVideoPageHtml({ title: effectiveTitle, description, videoFileName: `video.${ext}` });
    await client.putFileContents(owner, repoName, pagePath, {
      message: `Add page for: ${effectiveTitle}`,
      contentBase64: encodeTextToBase64(pageHtml),
      branch: defaultBranch,
    });

    const shareUrl = new URL(`media/${slug}/`, pagesUrl).toString();
    showResult(shareUrl, owner, repoName);
    setStatus(uploadStatus, 'Done.', 'success');
  } catch (err) {
    setStatus(uploadStatus, describeError(err), 'error');
  } finally {
    setBusy(videoUploadBtn, false, 'Uploading…', 'Upload');
  }
}

videoUploadBtn.addEventListener('click', () =>
  uploadVideo(videoTitleInput.value.trim(), videoDescriptionInput.value.trim(), videoFileInput.files[0])
);

resultCopyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(resultUrlInput.value);
    resultCopyBtn.textContent = 'Copied!';
    setTimeout(() => (resultCopyBtn.textContent = 'Copy'), 1500);
  } catch {
    resultUrlInput.select();
  }
});

resultRecheckBtn.addEventListener('click', async () => {
  const { owner, repoName } = resultSection.dataset;
  if (!owner || !repoName || !client) return;
  resultRecheckBtn.disabled = true;
  resultRecheckBtn.textContent = 'Checking…';
  try {
    const pages = await client.getPagesInfo(owner, repoName);
    if (pages?.status === 'built') {
      resultNote.textContent = 'Live and built.';
    } else if (pages?.status === 'errored') {
      resultNote.textContent = "GitHub Pages reported a build error — check the repository's Pages settings on github.com.";
    } else {
      resultNote.textContent = 'Still building — your files are safely committed either way. Try again shortly.';
    }
  } catch (err) {
    resultNote.textContent = describeError(err);
  } finally {
    resultRecheckBtn.disabled = false;
    resultRecheckBtn.textContent = "Check if it's live";
  }
});

(function init() {
  const saved = loadStoredToken();
  if (saved) {
    tokenInput.value = saved;
    if (localStorage.getItem(TOKEN_STORAGE_KEY)) tokenRemember.checked = true;
    connectToken(saved, { silent: true });
  }
})();
