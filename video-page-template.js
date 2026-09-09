import { escapeHtml } from './html-escape.js';

export function buildVideoPageHtml({ title, videoFileName }) {
  const safeTitle = escapeHtml(title || 'Video');
  const safeVideoSrc = encodeURIComponent(videoFileName);
  const csp = "default-src 'self'; script-src 'none'; base-uri 'none'; frame-ancestors *;";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${safeTitle}</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
  video { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>
</head>
<body>
  <video controls playsinline src="${safeVideoSrc}"></video>
</body>
</html>
`;
}
