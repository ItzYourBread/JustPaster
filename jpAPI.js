const baseUrl = process.env.JUSTPASTER_URL || 'http://localhost:3000';

async function request(path, options) {
  const response = await fetch(new URL(path, `${baseUrl}/`), options);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `Request failed with status ${response.status}`);
  }
  return result;
}

module.exports = {
  async createPaste(content, editCode) {
    const result = await request('/api/paste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, editCode })
    });
    return result.id;
  },

  async createPastes(pastes) {
    const result = await request('/api/pastes/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pastes })
    });
    return result.pastes.map((paste) => paste.id);
  },

  async editPaste(id, content, editCode) {
    const result = await request(`/api/paste/${encodeURIComponent(id)}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, editCode })
    });
    return result.updated;
  },

  async getPasteViews(id) {
    const result = await request(`/api/paste/${encodeURIComponent(id)}/views`);
    return result.views;
  },

  async shortenUrl(originalUrl) {
    const result = await request('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalUrl })
    });
    return new URL(result.shortUrl, `${baseUrl}/`).toString();
  }
};
