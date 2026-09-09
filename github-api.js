const API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

export class GitHubApiError extends Error {
  constructor(message, { status = 0, githubMessage = null, retryAfterSeconds = null, isNetworkError = false } = {}) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.githubMessage = githubMessage;
    this.retryAfterSeconds = retryAfterSeconds;
    this.isNetworkError = isNetworkError;
  }
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function createGitHubClient(token) {
  async function request(method, path, body) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': API_VERSION,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GitHubApiError('Network error contacting GitHub. Check your connection and try again.', { isNetworkError: true });
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // non-JSON body; leave data as null
      }
    }

    if (!response.ok) {
      const retryAfterHeader = response.headers.get('retry-after');
      throw new GitHubApiError(data?.message || `GitHub API request failed (${response.status})`, {
        status: response.status,
        githubMessage: data?.message ?? null,
        retryAfterSeconds: retryAfterHeader ? Number(retryAfterHeader) : null,
      });
    }

    return data;
  }

  // A 404 is only ever "doesn't exist yet" for lookups, never for writes —
  // callers that write must see it as a real error, so this helper is opt-in
  // per call rather than baked into request() itself.
  async function getOrNull(path) {
    try {
      return await request('GET', path);
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 404) return null;
      throw err;
    }
  }

  return {
    getAuthenticatedUser: () => request('GET', '/user'),

    getAccountType: async (login) => {
      const data = await getOrNull(`/users/${encodeURIComponent(login)}`);
      return data ? data.type : null; // 'User' | 'Organization' | null
    },

    getRepo: (owner, repo) => getOrNull(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`),

    createUserRepo: (name, { isPrivate = false, description = '' } = {}) => {
      const body = { name, private: isPrivate, auto_init: true };
      if (description) body.description = description;
      return request('POST', '/user/repos', body);
    },

    createOrgRepo: (org, name, { isPrivate = false, description = '' } = {}) => {
      const body = { name, private: isPrivate, auto_init: true };
      if (description) body.description = description;
      return request('POST', `/orgs/${encodeURIComponent(org)}/repos`, body);
    },

    getPagesInfo: (owner, repo) => getOrNull(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages`),

    enablePages: (owner, repo, branch, path = '/') =>
      request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages`, {
        source: { branch, path },
      }),

    getLatestPagesBuild: (owner, repo) =>
      getOrNull(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages/builds/latest`),

    getFileMeta: (owner, repo, path) =>
      getOrNull(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`),

    putFileContents: (owner, repo, path, { message, contentBase64, sha, branch }) => {
      const body = { message, content: contentBase64 };
      if (sha) body.sha = sha;
      if (branch) body.branch = branch;
      return request(
        'PUT',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`,
        body
      );
    },
  };
}
