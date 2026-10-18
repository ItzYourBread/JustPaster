const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const { app } = require('../app');
const { Paste, generatePasteId } = require('../models/paste');
const { LinkShortener, generateShortLinkId } = require('../models/linkShortener');
const { MAX_PASTE_BYTES, validatePasteContent } = require('../utils/pasteContent');
const { MAX_SHORT_URL_LENGTH, validateShortUrl } = require('../utils/shortUrl');
const { validateEditCode, hashEditCode, verifyEditCode } = require('../utils/editCode');

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('paste IDs use the existing PT URL format', () => {
  for (let index = 0; index < 100; index++) {
    assert.match(generatePasteId(), /^PT[A-Za-z0-9]{8}$/);
  }
});

test('content validation rejects empty text and enforces UTF-8 size', () => {
  assert.equal(validatePasteContent(undefined).status, 400);
  assert.equal(validatePasteContent('  \n').status, 400);
  assert.equal(validatePasteContent('x'.repeat(MAX_PASTE_BYTES)), null);
  assert.equal(validatePasteContent('é'.repeat(MAX_PASTE_BYTES / 2)), null);
  assert.equal(validatePasteContent('é'.repeat(MAX_PASTE_BYTES / 2 + 1)).status, 413);
});

test('edit codes are validated, salted, and verified without storing plaintext', async () => {
  assert.equal(validateEditCode(undefined), null);
  assert.equal(validateEditCode('short').status, 400);
  assert.equal(validateEditCode('long-enough-code'), null);

  const storedCode = await hashEditCode('long-enough-code');
  assert.notEqual(storedCode.editCodeHash, 'long-enough-code');
  assert.notEqual(storedCode.editCodeSalt, '');
  assert.equal(await verifyEditCode('long-enough-code', storedCode.editCodeSalt, storedCode.editCodeHash), true);
  assert.equal(await verifyEditCode('incorrect-code', storedCode.editCodeSalt, storedCode.editCodeHash), false);
});

test('paste model applies view defaults and requires content', async () => {
  const paste = new Paste({ content: 'hello' });

  assert.match(paste.id, /^PT[A-Za-z0-9]{8}$/);
  assert.equal(paste.views, 0);
  assert.ok(paste.createdAt instanceof Date);
  await paste.validate();
  await assert.rejects(new Paste({}).validate(), /content/);
});

test('short-link IDs retain the LS URL format and model defaults', async () => {
  for (let index = 0; index < 100; index++) {
    assert.match(generateShortLinkId(), /^LS[A-Za-z0-9]{8}$/);
  }

  const shortLink = new LinkShortener({ originalUrl: 'https://example.com/' });
  assert.match(shortLink.id, /^LS[A-Za-z0-9]{8}$/);
  assert.equal(shortLink.clickCount, 0);
  assert.ok(shortLink.createdAt instanceof Date);
  await shortLink.validate();
  await assert.rejects(new LinkShortener({}).validate(), /originalUrl/);
});

test('short-link validation allows HTTP(S) and rejects unsafe or malformed URLs', () => {
  assert.equal(validateShortUrl(' https://example.com/path '), null);
  assert.equal(validateShortUrl('http://localhost:3000'), null);
  assert.equal(validateShortUrl(undefined).status, 400);
  assert.equal(validateShortUrl('javascript:alert(1)').status, 400);
  assert.equal(validateShortUrl('ftp://example.com').status, 400);
  assert.equal(validateShortUrl('https://user:password@example.com').status, 400);
  assert.equal(validateShortUrl('not a URL').status, 400);
  assert.equal(validateShortUrl(`https://example.com/${'a'.repeat(MAX_SHORT_URL_LENGTH)}`).status, 400);
});

test('paste view escapes submitted HTML instead of executing it', async () => {
  const template = path.join(__dirname, '..', 'views', 'paste.ejs');
  const html = await ejs.renderFile(template, {
    paste: { _id: 'PTabcdefgh', views: 1, content: '<script>alert(1)</script>' },
    canEdit: false,
    siteUrl: 'https://justpaster.co'
  });

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/justpaster\.co\/PTabcdefgh">/);
});

test('home page renders and API returns useful validation errors', async () => {
  await withServer(async (baseUrl) => {
    const homeResponse = await fetch(baseUrl);
    const homeHtml = await homeResponse.text();
    assert.equal(homeResponse.status, 200);
    assert.match(homeHtml, /<title>Free Pastebin &amp; URL Shortener \| JustPaster<\/title>/);
    assert.match(homeHtml, /<meta name="description" content="A free pastebin and URL shortener/);
    assert.match(homeHtml, /<link rel="canonical" href="https:\/\/justpaster\.co\/">/);
    assert.match(homeHtml, /JustPaster/);
    assert.match(homeHtml, /Short link/);
    assert.match(homeHtml, /id="createShortLinkForm"/);
    assert.match(homeHtml, /id="editCode"/);

    const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robotsResponse.status, 200);
    const robotsText = await robotsResponse.text();
    assert.match(robotsText, /Disallow: \/api\//);
    assert.match(robotsText, /Sitemap: https:\/\/justpaster\.co\/sitemap\.xml/);

    const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(sitemapResponse.status, 200);
    const sitemapText = await sitemapResponse.text();
    assert.match(sitemapText, /<loc>https:\/\/justpaster\.co\/<\/loc>/);

    const emptyPasteResponse = await fetch(`${baseUrl}/api/paste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '  ' })
    });
    assert.equal(emptyPasteResponse.status, 400);
    assert.deepEqual(await emptyPasteResponse.json(), { error: 'Paste content is required' });

    const malformedJsonResponse = await fetch(`${baseUrl}/api/paste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    });
    assert.equal(malformedJsonResponse.status, 400);
    assert.deepEqual(await malformedJsonResponse.json(), { error: 'Invalid request body' });

    const largePasteResponse = await fetch(`${baseUrl}/api/paste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x'.repeat(MAX_PASTE_BYTES + 1) })
    });
    assert.equal(largePasteResponse.status, 413);

    const unsafeShortUrlResponse = await fetch(`${baseUrl}/api/shorten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalUrl: 'javascript:alert(1)' })
    });
    assert.equal(unsafeShortUrlResponse.status, 400);
    assert.deepEqual(await unsafeShortUrlResponse.json(), { error: 'Only HTTP and HTTPS URLs are supported' });
  });
});

test('protected pastes can be edited with their code and bulk-created through the API', async () => {
  const originalCreate = Paste.create;
  const originalInsertMany = Paste.insertMany;
  const originalFindById = Paste.findById;
  const protectedCode = 'correct-private-code';
  const storedCode = await hashEditCode(protectedCode);
  let editablePaste = {
    id: 'PTabcdefgh',
    content: 'Before edit',
    ...storedCode,
    save: async function save() { this.saved = true; }
  };
  let bulkRecords;

  Paste.create = async (record) => ({ id: 'PTabcdefgh', ...record });
  Paste.insertMany = async (records) => {
    bulkRecords = records;
    return records.map((record, index) => ({ id: `PTbulk000${index}`, ...record }));
  };
  Paste.findById = (id) => ({
    select: async () => id === editablePaste.id ? editablePaste : null
  });

  try {
    await withServer(async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/paste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Before edit', editCode: protectedCode })
      });
      assert.equal(createResponse.status, 201);
      assert.deepEqual(await createResponse.json(), { id: 'PTabcdefgh' });

      const bulkResponse = await fetch(`${baseUrl}/api/pastes/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pastes: [{ content: 'One' }, { content: 'Two' }] })
      });
      assert.equal(bulkResponse.status, 201);
      assert.deepEqual(await bulkResponse.json(), {
        pastes: [{ id: 'PTbulk0000' }, { id: 'PTbulk0001' }]
      });
      assert.equal(bulkRecords.length, 2);

      const wrongCodeResponse = await fetch(`${baseUrl}/api/paste/PTabcdefgh/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Nope', editCode: 'wrong-private-code' })
      });
      assert.equal(wrongCodeResponse.status, 403);
      assert.equal(editablePaste.content, 'Before edit');

      const editResponse = await fetch(`${baseUrl}/api/paste/PTabcdefgh/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'After edit', editCode: protectedCode })
      });
      assert.equal(editResponse.status, 200);
      assert.deepEqual(await editResponse.json(), { id: 'PTabcdefgh', updated: true });
      assert.equal(editablePaste.content, 'After edit');
      assert.equal(editablePaste.saved, true);
    });
  } finally {
    Paste.create = originalCreate;
    Paste.insertMany = originalInsertMany;
    Paste.findById = originalFindById;
  }
});

test('short links are created and redirect while incrementing clicks', async () => {
  const originalCreate = LinkShortener.create;
  const originalFindByIdAndUpdate = LinkShortener.findByIdAndUpdate;
  let savedLink;

  LinkShortener.create = async ({ originalUrl }) => {
    savedLink = { id: 'LSabcdefgh', originalUrl, clickCount: 0 };
    return savedLink;
  };
  LinkShortener.findByIdAndUpdate = async (id, update) => {
    assert.equal(id, 'LSabcdefgh');
    assert.deepEqual(update, { $inc: { clickCount: 1 } });
    savedLink.clickCount += 1;
    return savedLink;
  };

  try {
    await withServer(async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/shorten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalUrl: 'https://example.com/a/long/path' })
      });
      assert.equal(createResponse.status, 201);
      assert.deepEqual(await createResponse.json(), {
        id: 'LSabcdefgh',
        shortUrl: '/LSabcdefgh'
      });

      const redirectResponse = await fetch(`${baseUrl}/LSabcdefgh`, { redirect: 'manual' });
      assert.equal(redirectResponse.status, 302);
      assert.equal(redirectResponse.headers.get('location'), 'https://example.com/a/long/path');
      assert.equal(savedLink.clickCount, 1);
    });
  } finally {
    LinkShortener.create = originalCreate;
    LinkShortener.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});
