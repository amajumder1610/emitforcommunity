import { escapeHtml } from './html-escape.js';

export function buildEmbedCode(videoUrl) {
  const encodedUrl = encodeURIComponent(videoUrl);
  const widgetSrc =
    `//cdn.embedly.com/widgets/media.html?src=${encodedUrl}&display_name=EMIT&url=${encodedUrl}&type=text%2Fhtml&schema=EMIT`;

  return (
    `<div data-oembed-url="${escapeHtml(videoUrl)}" style="border-radius:12px;overflow:hidden;">` +
    `<iframe allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen="true" ` +
    `class="embedly-embed" frameborder="0" height="400" scrolling="no" src="${escapeHtml(widgetSrc)}" ` +
    `style="border-radius:12px;object-fit:cover;" tabindex="-1" title="EMIT embed" width="600"></iframe></div>`
  );
}
