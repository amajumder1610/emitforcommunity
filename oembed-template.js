import { escapeHtml } from './html-escape.js';

const EMBED_WIDTH = 600;
const EMBED_HEIGHT = 400;

export function buildOembedJson({ pageUrl, title }) {
  const html =
    `<iframe src="${escapeHtml(pageUrl)}" width="${EMBED_WIDTH}" height="${EMBED_HEIGHT}" frameborder="0" ` +
    `allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen ` +
    `style="border-radius:12px;"></iframe>`;

  return JSON.stringify({
    version: '1.0',
    type: 'video',
    provider_name: 'EMIT',
    title: title || 'Video',
    html,
    width: EMBED_WIDTH,
    height: EMBED_HEIGHT,
  });
}

export function buildOembedDiscoveryTag(pageUrl) {
  const oembedUrl = new URL('oembed.json', pageUrl).toString();
  const href = `${oembedUrl}?url=${encodeURIComponent(pageUrl)}&format=json`;
  return `<link rel="alternate" type="application/json+oembed" href="${escapeHtml(href)}" title="EMIT">`;
}
