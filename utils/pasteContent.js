const MAX_PASTE_BYTES = 1024 * 1024;

function validatePasteContent(content) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    return { status: 400, error: 'Paste content is required' };
  }

  if (Buffer.byteLength(content, 'utf8') > MAX_PASTE_BYTES) {
    return { status: 413, error: 'Paste content must be 1 MB or smaller' };
  }

  return null;
}

module.exports = { MAX_PASTE_BYTES, validatePasteContent };
