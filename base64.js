// Must stay a multiple of 3 (base64 encodes in 3-byte groups).
const CHUNK_BYTES = 6 * 1024 * 1024;

function bytesToBinaryString(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}

export async function encodeFileToBase64(file, onProgress) {
  const parts = [];
  for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
    const slice = file.slice(offset, offset + CHUNK_BYTES);
    const bytes = new Uint8Array(await slice.arrayBuffer());
    parts.push(btoa(bytesToBinaryString(bytes)));
    onProgress?.(Math.min(1, (offset + bytes.length) / file.size));
  }
  return parts.join('');
}

export function encodeTextToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  return btoa(bytesToBinaryString(bytes));
}
