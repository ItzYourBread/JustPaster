const MAX_SHORT_URL_LENGTH = 2048;

function validateShortUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { status: 400, error: 'Destination URL is required' };
  }

  const input = value.trim();
  if (input.length > MAX_SHORT_URL_LENGTH) {
    return { status: 400, error: 'Destination URL must be 2048 characters or fewer' };
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    return { status: 400, error: 'Enter a valid absolute URL' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { status: 400, error: 'Only HTTP and HTTPS URLs are supported' };
  }

  if (url.username || url.password) {
    return { status: 400, error: 'URLs containing credentials are not supported' };
  }

  return null;
}

module.exports = { MAX_SHORT_URL_LENGTH, validateShortUrl };
