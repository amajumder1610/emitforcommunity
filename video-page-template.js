import { escapeHtml } from './html-escape.js';
import { buildOembedDiscoveryTag } from './oembed-template.js';

export function buildVideoPageHtml({ title, videoFileName, pageUrl }) {
  const safeTitle = escapeHtml(title || 'Video');
  const safeVideoSrc = encodeURIComponent(videoFileName);
  const oembedTag = pageUrl ? buildOembedDiscoveryTag(pageUrl) : '';
  // No default-src/style-src here on purpose: this page's CSS lives in an
  // inline <style> block, and default-src 'self' silently blocks inline
  // styles unless style-src explicitly allows them. script-src 'none' is
  // the actual protection that matters (no script can ever run on this
  // page); leaving style unrestricted is what lets that inline block apply
  // at all. frame-ancestors is intentionally omitted too — it's a no-op
  // when delivered via <meta> (browsers ignore it there), so this doesn't
  // change embeddability; a real restriction would need an HTTP header,
  // which static hosting here can't send per-file anyway.
  const csp = "script-src 'none'; base-uri 'none';";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${safeTitle}</title>
${oembedTag}
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
