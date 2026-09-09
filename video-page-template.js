import { escapeHtml } from './html-escape.js';

export function buildVideoPageHtml({ title, description, videoFileName }) {
  const safeTitle = escapeHtml(title || 'Untitled video');
  const rawDescription = description || '';
  const safeDescriptionHtml = rawDescription ? escapeHtml(rawDescription).replace(/\n/g, '<br>') : '';
  const safeVideoSrc = encodeURIComponent(videoFileName);

  // frame-ancestors is deliberately permissive: this page exists to be
  // embedded elsewhere (Gainsight, etc.) — that's the "Embeddable" in EMIT.
  const csp =
    "default-src 'self'; script-src 'none'; base-uri 'none'; frame-ancestors *;";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${safeTitle}</title>
<meta property="og:title" content="${safeTitle}">
${rawDescription ? `<meta property="og:description" content="${escapeHtml(rawDescription)}">\n` : ''}<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; min-height: 100%; background: #0b0c0f; color: #f2f2f2; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; gap: 16px; }
  video { width: 100%; max-width: 960px; border-radius: 8px; background: #000; }
  h1 { font-size: 1.15rem; font-weight: 600; margin: 0; text-align: center; max-width: 960px; }
  p { margin: 0; opacity: 0.85; text-align: center; max-width: 960px; }
</style>
</head>
<body>
  <div class="wrap">
    <video controls playsinline src="${safeVideoSrc}"></video>
    <h1>${safeTitle}</h1>
    ${safeDescriptionHtml ? `<p>${safeDescriptionHtml}</p>` : ''}
  </div>
</body>
</html>
`;
}
