import { createGitHubClient, GitHubApiError } from './github-api.js';
import { slugify, withSuffix } from './slug.js';
import { encodeFileToBase64, encodeTextToBase64 } from './base64.js';
import { buildVideoPageHtml } from './video-page-template.js';
import { buildEmbedCode } from './embed-template.js';
import { looksLikeDirectVideoUrl, extractM3u8Url } from './video-url-extract.js';

const TOKEN_STORAGE_KEY = 'emit.passphrase';
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const WARN_FILE_BYTES = 50 * 1024 * 1024;
const FIXED_OWNER = 'amajumder1610';
const FIXED_REPO = 'emitforcommunity';

const el = (id) => document.getElementById(id);

const productSelect = el('product-select');

const tokenSection = el('section-token');
const tokenInput = el('token-input');
const tokenToggle = el('token-toggle');
const tokenRemember = el('token-remember');
const tokenConnectBtn = el('token-connect');
const tokenStatus = el('token-status');

const uploadSection = el('section-upload');
const pathwayVideoBtn = el('pathway-video-btn');
const pathwayUrlBtn = el('pathway-url-btn');
const pathwayVideoDiv = el('pathway-video');
const pathwayUrlDiv = el('pathway-url');
const videoFileInput = el('video-file');
const videoFileInfo = el('video-file-info');
const videoUploadBtn = el('video-upload');
const helpxUrlInput = el('helpx-url');
const helpxSubmitBtn = el('helpx-submit');
const uploadStatus = el('upload-status');

const resultSection = el('section-result');
const resultOpenLink = el('result-open');
const resultNote = el('result-note');
const embedCopyBtn = el('embed-copy');

let client = null;
let authUser = null;
let connectedRepo = null;
let currentEmbedCode = '';

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

async function ensurePagesReady(owner, repoName, defaultBranch) {
  let pages = await client.getPagesInfo(owner, repoName);

  if (!pages) {
    pages = await client.enablePages(owner, repoName, defaultBranch, '/');
  } else if (pages.build_type === 'workflow') {
    throw new Error("This destination can't be used right now.");
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

async function connectFixedDestination() {
  let repo = await client.getRepo(FIXED_OWNER, FIXED_REPO);

  if (!repo) {
    try {
      if (FIXED_OWNER.toLowerCase() === authUser.login.toLowerCase()) {
        repo = await client.createUserRepo(FIXED_REPO, { isPrivate: false });
      } else {
        const accountType = await client.getAccountType(FIXED_OWNER);
        if (accountType === 'Organization') {
          repo = await client.createOrgRepo(FIXED_OWNER, FIXED_REPO, { isPrivate: false });
        } else {
          throw new Error("Couldn't set up. Please try again later.");
        }
      }
    } catch (err) {
      if (err instanceof GitHubApiError && (err.status === 403 || err.status === 404)) {
        throw new Error("Couldn't set up automatically. Please try again later.");
      }
      throw err;
    }
  }

  const pages = await ensurePagesReady(FIXED_OWNER, repo.name, repo.default_branch);

  connectedRepo = {
    owner: FIXED_OWNER,
    repoName: repo.name,
    defaultBranch: repo.default_branch,
    pagesUrl: pages.html_url,
  };
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

    setStatus(tokenStatus, 'Setting up…');
    await connectFixedDestination();

    tokenSection.hidden = true;
    uploadSection.hidden = false;
  } catch (err) {
    client = null;
    authUser = null;
    connectedRepo = null;
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

function setPathway(showVideo) {
  pathwayVideoDiv.hidden = !showVideo;
  pathwayUrlDiv.hidden = showVideo;
  pathwayVideoBtn.classList.toggle('active', showVideo);
  pathwayUrlBtn.classList.toggle('active', !showVideo);
  setStatus(uploadStatus, '');
}

pathwayVideoBtn.addEventListener('click', () => setPathway(true));
pathwayUrlBtn.addEventListener('click', () => setPathway(false));

videoFileInput.addEventListener('change', () => {
  const file = videoFileInput.files[0];
  videoFileInfo.textContent = file ? `${file.name} — ${formatBytes(file.size)}` : '';
});

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function findFreeUploadFolder(owner, repoName, productSlug, ext) {
  const baseDate = todayIsoDate();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const dateSegment = withSuffix(baseDate, attempt);
    const folder = `media/${productSlug}/${dateSegment}`;
    const [videoMeta, pageMeta] = await Promise.all([
      client.getFileMeta(owner, repoName, `${folder}/video.${ext}`),
      client.getFileMeta(owner, repoName, `${folder}/index.html`),
    ]);
    if (!videoMeta && !pageMeta) return { folder, resumeVideoOnly: false };
    if (videoMeta && !pageMeta) return { folder, resumeVideoOnly: true };
  }
  throw new Error("Couldn't find an available slot for this upload — try again.");
}

let resultGeneration = 0;

function showResult(url, pollTarget) {
  resultGeneration += 1;
  const generation = resultGeneration;

  resultSection.hidden = false;
  resultOpenLink.href = url;
  currentEmbedCode = buildEmbedCode(url);
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (pollTarget) {
    resultNote.textContent = 'Processing…';
    pollDeploymentStatus(pollTarget.owner, pollTarget.repoName, generation);
  } else {
    resultNote.textContent = 'Live.';
  }
}

async function pollDeploymentStatus(owner, repoName, generation) {
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    if (generation !== resultGeneration) return;
    try {
      const pages = await client.getPagesInfo(owner, repoName);
      if (generation !== resultGeneration) return;
      if (pages?.status === 'built') {
        resultNote.textContent = 'Live.';
        return;
      }
      if (pages?.status === 'errored') {
        resultNote.textContent = 'Something went wrong. Please try again.';
        return;
      }
    } catch {
      // transient error while polling; keep trying until the deadline
    }
  }
  if (generation === resultGeneration) {
    resultNote.textContent = 'Still processing — the link will work once ready.';
  }
}

async function uploadVideo(file) {
  if (!connectedRepo) {
    setStatus(uploadStatus, 'Please reconnect and try again.', 'error');
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

  const fileTitle = file.name.replace(/\.[^.]+$/, '') || 'untitled';
  const ext = getFileExtension(file);
  const productSlug = slugify(productSelect.value);
  const { owner, repoName, defaultBranch, pagesUrl } = connectedRepo;

  setBusy(videoUploadBtn, true, 'Uploading…', 'Upload');
  try {
    if (file.size > WARN_FILE_BYTES) {
      setStatus(uploadStatus, 'This is a large file — it may take a while.');
    }

    const { folder, resumeVideoOnly } = await findFreeUploadFolder(owner, repoName, productSlug, ext);
    const videoPath = `${folder}/video.${ext}`;
    const pagePath = `${folder}/index.html`;

    if (!resumeVideoOnly) {
      setStatus(uploadStatus, 'Preparing…');
      const contentBase64 = await encodeFileToBase64(file, (fraction) => {
        setStatus(uploadStatus, `Preparing… ${Math.round(fraction * 100)}%`);
      });
      setStatus(uploadStatus, 'Uploading…');
      await client.putFileContents(owner, repoName, videoPath, {
        message: `Add video: ${fileTitle}`,
        contentBase64,
        branch: defaultBranch,
      });
    } else {
      setStatus(uploadStatus, 'Finishing up…');
    }

    setStatus(uploadStatus, 'Publishing…');
    const pageHtml = buildVideoPageHtml({ title: fileTitle, videoFileName: `video.${ext}` });
    await client.putFileContents(owner, repoName, pagePath, {
      message: `Add page for: ${fileTitle}`,
      contentBase64: encodeTextToBase64(pageHtml),
      branch: defaultBranch,
    });

    const shareUrl = new URL(`${folder}/`, pagesUrl).toString();
    showResult(shareUrl, { owner, repoName });
    setStatus(uploadStatus, 'Done.', 'success');
  } catch (err) {
    setStatus(uploadStatus, describeError(err), 'error');
  } finally {
    setBusy(videoUploadBtn, false, 'Uploading…', 'Upload');
  }
}

videoUploadBtn.addEventListener('click', () => uploadVideo(videoFileInput.files[0]));

async function handleHelpxSubmit(rawInput) {
  const input = rawInput.trim();
  if (!input) {
    setStatus(uploadStatus, 'Paste a page link first.', 'error');
    return;
  }

  setBusy(helpxSubmitBtn, true, 'Fetching…', 'Get link');
  try {
    if (looksLikeDirectVideoUrl(input)) {
      showResult(input);
      setStatus(uploadStatus, 'Done.', 'success');
      return;
    }

    setStatus(uploadStatus, 'Fetching…');
    let html;
    try {
      const response = await fetch(input);
      if (!response.ok) throw new Error('fetch-failed');
      html = await response.text();
    } catch {
      setStatus(
        uploadStatus,
        "Couldn't read that page automatically. Open it, find the video, and paste the direct video link here instead.",
        'error'
      );
      return;
    }

    const found = extractM3u8Url(html);
    if (!found) {
      setStatus(
        uploadStatus,
        "Couldn't find a video on that page. Open it, find the video, and paste the direct video link here instead.",
        'error'
      );
      return;
    }

    showResult(found);
    setStatus(uploadStatus, 'Done.', 'success');
  } finally {
    setBusy(helpxSubmitBtn, false, 'Fetching…', 'Get link');
  }
}

helpxSubmitBtn.addEventListener('click', () => handleHelpxSubmit(helpxUrlInput.value));

embedCopyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(currentEmbedCode);
    embedCopyBtn.textContent = 'Copied!';
    setTimeout(() => (embedCopyBtn.textContent = 'Copy embed code'), 1500);
  } catch {
    setStatus(uploadStatus, "Couldn't copy automatically.", 'error');
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
