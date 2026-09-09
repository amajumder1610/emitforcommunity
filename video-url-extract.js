const M3U8_PATTERN = /https:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i;

export function looksLikeDirectVideoUrl(input) {
  return /\.m3u8(\?.*)?$/i.test(input.trim());
}

export function extractM3u8Url(htmlText) {
  const match = M3U8_PATTERN.exec(htmlText);
  return match ? match[0] : null;
}
