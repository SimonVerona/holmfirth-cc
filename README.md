# Holmfirth CC Website

Plain HTML/CSS/JS site deployed on Cloudflare Pages, with a Cloudflare Worker
proxying the Ride With GPS API for live events, routes and ride writeups.

## Architecture

```
Browser
  │
  ├── /                  Static HTML/CSS/JS  (Cloudflare Pages)
  ├── /events.html       Live events from RWGPS
  ├── /blog.html         Ride writeups from RWGPS
  │
  └── /api/*             Cloudflare Worker  (worker/index.js)
        ├── /api/events         Club events list
        ├── /api/events/:id     Single event detail
        ├── /api/routes         Club route library
        ├── /api/routes/:id     Single route detail
        ├── /api/trips          Completed trips (blog feed)
        ├── /api/trips/:id      Single trip detail
        └── /api/health         Health check
```

Key files:
- `worker/index.js`  — Worker: RWGPS proxy with edge caching + CORS
- `js/rwgps.js`      — Client module: all fetch + render helpers
- `js/main.js`       — Nav, scroll reveal, page-specific data loading
- `wrangler.jsonc`   — Cloudflare config

## Local development

**Prerequisites:** Node.js 18+, a Ride With GPS account with API access.

```bash
npm install wrangler --save-dev

# Copy the secrets template and fill in your real values
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your RWGPS credentials

# Run locally (worker + static assets on http://localhost:8787)
npx wrangler dev
```

## Getting RWGPS credentials

1. Sign into ridewithgps.com
2. Go to **Account → Settings → Developer**
3. Create an API Client — copy the **API Key**
4. Open that client → **Create Auth Token** — copy the **Auth Token**
5. Your **Club ID** is the number in your club URL:
   `ridewithgps.com/clubs/12345` → `12345`

## Deploying to Cloudflare

The site auto-deploys via Cloudflare Pages on push to `main`.
Secrets must be set once via Wrangler CLI (not via the dashboard for Workers
integrated with Pages):

```bash
npx wrangler secret put RWGPS_API_KEY
npx wrangler secret put RWGPS_AUTH_TOKEN
npx wrangler secret put RWGPS_CLUB_ID
```

You'll be prompted to paste the value for each. Secrets are encrypted at rest
and never appear in logs or responses.

## Adding live data to a page

1. Add `data-page="yourpage"` to `<body>`
2. Add a container `<div id="your-container">` where you want data
3. Add a handler in `js/main.js`:

```js
if (page === 'yourpage') loadYourPage();

async function loadYourPage() {
  const container = document.getElementById('your-container');
  showLoading(container, 3, 'event-row-skeleton');
  try {
    const data = await getEvents();
    renderEventList(container, data.events ?? []);
  } catch (err) {
    showError(container, 'Could not load data.', loadYourPage);
  }
}
```

## Cache TTLs (worker/index.js)

| Endpoint      | TTL     | Rationale                        |
|---------------|---------|----------------------------------|
| events list   | 15 min  | Changes regularly                |
| single event  | 30 min  | Stable once posted               |
| routes list   | 60 min  | Rarely changes                   |
| single route  | 60 min  | Rarely changes                   |
| trips list    | 15 min  | New writeups appear frequently   |
| single trip   | 60 min  | Stable once posted               |

Adjust in `CACHE_TTL` at the top of `worker/index.js`.
