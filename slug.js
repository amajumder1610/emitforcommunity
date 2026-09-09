const COMBINING_MARK_START = 0x0300;
const COMBINING_MARK_END = 0x036f;

function stripCombiningMarks(input) {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code >= COMBINING_MARK_START && code <= COMBINING_MARK_END) continue;
    out += ch;
  }
  return out;
}

export function slugify(title) {
  const stripped = stripCombiningMarks(String(title ?? '').normalize('NFKD'));

  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

  return slug || 'untitled';
}

export function withSuffix(baseSlug, attempt) {
  return attempt <= 1 ? baseSlug : `${baseSlug}-${attempt}`;
}
