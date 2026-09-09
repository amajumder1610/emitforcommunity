import { createGitHubClient, GitHubApiError } from './github-api.js';
import { slugify, withSuffix } from './slug.js';
import { encodeFileToBase64, encodeTextToBase64 } from './base64.js';
import { buildVideoPageHtml } from './video-page-template.js';

const TOKEN_STORAGE_KEY = 'emit.passphrase';
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const WARN_FILE_BYTES = 50 * 1024 * 1024;

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
let connectedRepo = null;

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
  console.error(err);
  if (err instanceof GitHubApiError) {
    if (err.isNetworkError) return 'Could not connect. Check your connection and try again.';
    if (err.status === 401) return "That passphrase wasn't accepted. Please check it and try again.";
    if (err.retryAfterSeconds) return `Please wait about ${err.retryAfterSeconds}s and try again.`;
    return 'Something went wrong. Please try again.';
  }
  return err?.message || 'Something went wrong. Please try again.';
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
    setStatus(tokenStatus, 'Enter your passphrase first.', 'error');
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
    setStatus(tokenStatus, 'Connected.', 'success');
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
    setStatus(repoStatus, 'Connected. This may take a few minutes to finish setting up.', 'success');
  } else if (pages.build_type === 'workflow') {
    throw new Error("This destination can't be used right now. Please choose a different one.");
  } else if (pages.source && pages.source.branch !== defaultBranch) {
    setStatus(repoStatus, "Connected, but this destination may not update correctly. Consider using a different one.", 'error');
  } else {
    setStatus(repoStatus, 'Connected.', 'success');
  }

  const marker = await client.getFileMeta(owner, repoName, '.nojekyll');
  if (!marker) {
    await client.putFileContents(owner, repoName, '.nojekyll', {
      message: 'Initial setup',
      contentBase64: '',
      branch: defaultBranch,
    });
  }

  return pages;
}

async function connectRepo(owner, repoName, makePrivate) {
  if (!client) {
    setStatus(repoStatus, 'Connect first.', 'error');
    return;
  }
  if (!owner || !repoName) {
    setStatus(repoStatus, 'Enter both fields to continue.', 'error');
    return;
  }

  setBusy(repoConnectBtn, true, 'Connecting…', 'Continue');
  setStatus(repoStatus, 'Checking…');
  connectedRepo = null;
  uploadSection.hidden = true;
  resultSection.hidden = true;
  try {
    let repo = await client.getRepo(owner, repoName);

    if (!repo) {
      try {
        if (owner.toLowerCase() === authUser.login.toLowerCase()) {
          setStatus(repoStatus, 'Setting up…');
          repo = await client.createUserRepo(repoName, { isPrivate: makePrivate });
        } else {
          const accountType = await client.getAccountType(owner);
          if (accountType === 'Organization') {
            setStatus(repoStatus, 'Setting up…');
            repo = await client.createOrgRepo(owner, repoName, { isPrivate: makePrivate });
          } else {
            throw new Error("Couldn't find that account. Check the details and try again.");
          }
        }
      } catch (err) {
        if (err instanceof GitHubApiError && (err.status === 403 || err.status === 404)) {
          throw new Error("Couldn't set that up automatically. Ask whoever manages this tool to create it, then try again.");
        }
        throw err;
      }
    }

    setStatus(repoStatus, 'Almost there…');
    const pages = await ensurePagesReady(owner, repo.name, repo.default_branch);

    connectedRepo = {
      owner,
      repoName: repo.name,
      defaultBranch: repo.default_branch,
      pagesUrl: pages.html_url,
    };

    uploadSection.hidden = false;
  } catch (err) {
    setStatus(repoStatus, describeError(err), 'error');
  } finally {
    setBusy(repoConnectBtn, false, 'Connecting…', 'Continue');
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
  throw new Error("Couldn't find an available name for this upload — try a different title.");
}

function showResult(url, owner, repoName) {
  resultSection.hidden = false;
  resultUrlInput.value = url;
  resultOpenLink.href = url;
  resultNote.textContent = "This may take a minute or two to go live. If the link doesn't work yet, try again shortly.";
  resultSection.dataset.owner = owner;
  resultSection.dataset.repoName = repoName;
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function uploadVideo(title, description, file) {
  if (!connectedRepo) {
    setStatus(uploadStatus, 'Choose a destination first.', 'error');
    return;
  }
  if (!file) {
    setStatus(uploadStatus, 'Choose a video file first.', 'error');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setStatus(uploadStatus, 'This video is too large. Please use a smaller file.', 'error');
    return;
  }

  const effectiveTitle = title || file.name.replace(/\.[^.]+$/, '');
  const ext = getFileExtension(file);
  const { owner, repoName, defaultBranch, pagesUrl } = connectedRepo;

  setBusy(videoUploadBtn, true, 'Uploading…', 'Upload');
  try {
    if (file.size > WARN_FILE_BYTES) {
      setStatus(uploadStatus, 'This is a large file — it may take a while.');
    }

    const baseSlug = slugify(effectiveTitle);
    const { slug, resumeVideoOnly } = await findFreeSlug(owner, repoName, baseSlug, ext);
    const videoPath = `media/${slug}/video.${ext}`;
    const pagePath = `media/${slug}/index.html`;

    if (!resumeVideoOnly) {
      setStatus(uploadStatus, 'Preparing…');
      const contentBase64 = await encodeFileToBase64(file, (fraction) => {
        setStatus(uploadStatus, `Preparing… ${Math.round(fraction * 100)}%`);
      });
      setStatus(uploadStatus, 'Uploading…');
      await client.putFileContents(owner, repoName, videoPath, {
        message: `Add video: ${effectiveTitle}`,
        contentBase64,
        branch: defaultBranch,
      });
    } else {
      setStatus(uploadStatus, 'Finishing up…');
    }

    setStatus(uploadStatus, 'Publishing…');
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
      resultNote.textContent = "It's live.";
    } else if (pages?.status === 'errored') {
      resultNote.textContent = 'Something went wrong. Please try again.';
    } else {
      resultNote.textContent = 'Still on its way — try again shortly.';
    }
  } catch (err) {
    resultNote.textContent = describeError(err);
  } finally {
    resultRecheckBtn.disabled = false;
    resultRecheckBtn.textContent = 'Check again';
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
