# JustPaster

[JustPaster](https://www.justpaster.xyz/) is a lightweight, self-hosted pastebin and URL shortener. Share text, code, notes, or links with a simple URL—no account required.

JustPaster is open source and welcomes bug reports, ideas, and contributions.

## Features

- Create and share text pastes without an account
- Optionally protect paste edits with a private edit code
- Shorten absolute HTTP and HTTPS URLs
- Create and retrieve pastes through a JSON API
- Create up to 50 pastes in one bulk API request
- Copy paste contents and links, generate QR codes, and view paste view counts
- Preserve pasted content as text rather than executing submitted HTML
- Self-host with Node.js and MongoDB

## Important privacy note

Pastes are public to anyone who has the link. An edit code only protects changes; it does not hide, encrypt, or limit access to paste contents. Pastes are not automatically deleted. Do not paste passwords, secrets, or sensitive personal information.

## Requirements

- Node.js 18.11 or newer
- MongoDB (local or hosted)

## Run locally

Clone the repository and install its dependencies:

```sh
git clone https://github.com/ItzYourBread/JustPaster.git
cd JustPaster
npm install
```

Create your local environment file:

```sh
cp .env.example .env
```

Set `MONGO_URL` in `.env` to your MongoDB connection string. The example value uses a local MongoDB instance. Then start JustPaster:

```sh
npm start
```

Open [http://localhost:3000](http://localhost:3000). For automatic restarts while developing, run:

```sh
npm run dev
```

Run the test suite with:

```sh
npm test
```

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MONGO_URL` | Yes | — | MongoDB connection string |
| `PORT` | No | `3000` | Port for the web server |
| `SITE_URL` | No | `https://www.justpaster.xyz` | Public site origin used in canonical URLs, the sitemap, and `robots.txt` |
| `JUSTPASTER_URL` | No | `http://localhost:3000` | Base URL used by the `jpAPI.js` Node.js client |

For a self-hosted deployment, set `SITE_URL` to your public origin. Keep `.env` private; it is excluded from Git.

## HTTP API

All API routes are prefixed with `/api`. Send JSON requests with the `Content-Type: application/json` header. API errors use a JSON object with an `error` field.

### Create a paste

```http
POST /api/paste
Content-Type: application/json

{"content":"Hello, world!"}
```

An optional `editCode` (8–128 characters) lets its holder update the paste later. The code is stored as a salted hash.

```json
{"content":"A note I may update","editCode":"example-private-code"}
```

On success, the API returns `201 Created`:

```json
{"id":"PTabcdefgh"}
```

Paste content must be non-empty and no larger than 1 MiB in UTF-8. Open a paste at `/{id}`.

### Edit a protected paste

```http
POST /api/paste/{id}/edit
Content-Type: application/json

{"content":"Updated text","editCode":"example-private-code"}
```

On success, the API returns:

```json
{"id":"PTabcdefgh","updated":true}
```

Only pastes created with an edit code can be edited through this endpoint.

### Create pastes in bulk

Send between 1 and 50 pastes. The entire request body is limited to 8 MiB, and the request is rejected if any item is invalid.

```http
POST /api/pastes/bulk
Content-Type: application/json

{"pastes":[{"content":"First paste"},{"content":"Second paste","editCode":"example-private-code"}]}
```

The response lists IDs in the same order as the input:

```json
{"pastes":[{"id":"PTabcdefgh"},{"id":"PTijklmnop"}]}
```

### Read a paste's view count

```http
GET /api/paste/{id}/views
```

```json
{"views":3}
```

### Shorten a URL

```http
POST /api/shorten
Content-Type: application/json

{"originalUrl":"https://example.com/a/long/link"}
```

Only absolute HTTP and HTTPS URLs are accepted; URLs containing credentials are rejected. On success, the API returns `201 Created`:

```json
{"id":"LSabcdefgh","shortUrl":"/LSabcdefgh"}
```

Open the returned path on your JustPaster host to redirect to the destination URL.

### IDs and limits

- Paste IDs use the format `PT` followed by eight letters or digits.
- Short-link IDs use the format `LS` followed by eight letters or digits.
- Paste content is limited to 1 MiB in UTF-8.
- Bulk requests accept at most 50 pastes and have an 8 MiB JSON body limit.

## Node.js client

The included [`jpAPI.js`](./jpAPI.js) module provides helpers for common API operations:

```js
const justPaster = require('./jpAPI');

const pasteId = await justPaster.createPaste('Hello from a script');
const pasteIds = await justPaster.createPastes([
  { content: 'First paste' },
  { content: 'Protected paste', editCode: 'example-private-code' }
]);
const shortUrl = await justPaster.shortenUrl('https://example.com/');

console.log({ pasteId, pasteIds, shortUrl });
```

The client also exposes `editPaste(id, content, editCode)` and `getPasteViews(id)`. Set `JUSTPASTER_URL` in the environment when using a server other than `http://localhost:3000`.

## Project layout

```text
app.js                 Express application and server startup
routes/                Web pages and JSON API
models/                MongoDB models
utils/                 Content, URL, and edit-code validation
views/                 EJS page templates
public/                Static assets and styles
jpAPI.js               Node.js API client
test/                  Automated tests
```

## Contributing

Contributions of all sizes are welcome, including bug fixes, documentation improvements, and focused feature proposals.

1. Check existing issues or open one to discuss a larger change before starting.
2. Fork the repository and create a branch for your change.
3. Make a focused change that fits the existing project structure and conventions.
4. Run `npm test` and confirm the tests pass.
5. Open a pull request with a clear summary, motivation, and any relevant testing notes.

For bug reports, include steps to reproduce, expected behavior, actual behavior, and relevant environment details. Please do not include credentials, private paste contents, or other sensitive information.

If you discover a security issue, avoid posting exploit details or sensitive information in a public issue. Use GitHub's private vulnerability reporting for this repository if it is enabled.

## License

JustPaster is distributed under the [MIT License](./LICENSE).
