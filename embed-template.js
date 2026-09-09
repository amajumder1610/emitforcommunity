import { escapeHtml } from './html-escape.js';

export function buildEmbedCode(videoUrl) {
  const encodedUrl = encodeURIComponent(videoUrl);
  const widgetSrc =
    `//cdn.embedly.com/widgets/media.html?src=${encodedUrl}&display_name=EMIT&url=${encodedUrl}&type=text%2Fhtml&schema=EMIT`;

  // The iframe is absolutely positioned to fill the wrapper exactly, and the
  // wrapper (not the iframe) owns the rounded corners + overflow:hidden clip.
  // Sizing the iframe via its own width/height attributes and relying on
  // object-fit was not reliably clipping/fitting whatever embedly renders
  // inside it — this pins the visible box from the outside instead, so it
  // can't overflow regardless of what the iframe's own content does.
  const wrapperStyle =
    'position:relative;width:600px;max-width:100%;aspect-ratio:600/400;border-radius:12px;overflow:hidden;';
  const iframeStyle = 'position:absolute;top:0;left:0;width:100%;height:100%;border:0;';

  return (
    `<div data-oembed-url="${escapeHtml(videoUrl)}" style="${wrapperStyle}">` +
    `<iframe allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen="true" ` +
    `class="embedly-embed" frameborder="0" scrolling="no" src="${escapeHtml(widgetSrc)}" ` +
    `style="${iframeStyle}" tabindex="-1" title="EMIT embed" width="600" height="400"></iframe></div>`
  );
}
