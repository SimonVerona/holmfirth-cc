/**
 * Holmfirth CC — Cloudflare Worker
 * RWGPS API proxy with edge caching and CORS support.
 *
 * Secrets (set via `wrangler secret put` — never committed to git):
 *   RWGPS_API_KEY      — your Ride With GPS API key
 *   RWGPS_AUTH_TOKEN   — your Ride With GPS auth token
 *   RWGPS_CLUB_ID      — your club ID on RWGPS (numeric)
 *
 * Routes handled (all under /api/):
 *   GET /api/events          — upcoming club events (all pages, future only)
 *   GET /api/events/:id      — single event detail (with description + routes)
 *   GET /api/routes          — club route library
 *   GET /api/routes/:id      — single route detail
 *   GET /api/trips           — recent trips / ride writeups
 *   GET /api/trips/:id       — single trip detail
 *
 * Cache TTLs:
 *   events list   — 15 min   (changes regularly)
 *   single event  — 30 min
 *   routes list   — 60 min   (changes rarely)
 *   single route  — 60 min
 *   trips list    — 15 min
 *   single trip   — 60 min
 */

const RWGPS_BASE = 'https://ridewithgps.com/api/v1';

// Embedded blog.html for bot-safe serving (avoids env.ASSETS bot blocking)
const BLOG_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ride Writeups — Holmfirth Cycling Club</title>
  <meta name="description" content="Ride reports and writeups from Holmfirth Cycling Club — stories from the road, the hills and the café stops of the Holme Valley.">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/icons/favicon-32x32.png" type="image/png" sizes="32x32">
  <link rel="icon" href="/icons/favicon-16x16.png" type="image/png" sizes="16x16">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#D0021B">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="HCC">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    [data-reveal] { opacity: 0; transform: translateY(24px); transition: opacity 0.55s ease, transform 0.55s ease; }
    [data-reveal].revealed { opacity: 1; transform: none; }
    [data-reveal-delay="1"] { transition-delay: 0.15s; }

    /* ── Photo hero variant ── */
    .page-hero--photo {
      background-size: cover;
      background-position: center 40%;
      position: relative;
    }
    .page-hero--photo .page-hero-pattern { display: none; }
    .page-hero-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.10) 100%);
      z-index: 0;
    }
    .page-hero--photo .page-hero-content { position: relative; z-index: 1; }

    /* ── Blog grid ── */
    .blog-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 28px;
      margin-top: 8px;
    }
    .blog-card {
      background: var(--white);
      border: 1px solid var(--offwhite);
      border-radius: var(--radius);
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .blog-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    }
    .blog-card-img {
      height: 180px;
      background-color: var(--offwhite);
      background-size: cover;
      background-position: center;
    }
    .blog-card-img--placeholder {
      background-image:
        repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 12px,
          rgba(212,43,43,0.07) 12px,
          rgba(212,43,43,0.07) 13px
        );
    }
    .blog-card-body {
      padding: 20px 24px 24px;
    }
    .blog-card-date {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--red);
      margin-bottom: 8px;
    }
    .blog-card-title {
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1.2;
      margin-bottom: 8px;
    }
    .blog-card-title a {
      color: var(--black);
      text-decoration: none;
    }
    .blog-card-title a:hover { color: var(--red); }
    .blog-card-stats {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: var(--gray);
      margin-bottom: 10px;
    }
    .blog-card-excerpt {
      font-size: 14px;
      color: var(--gray);
      line-height: 1.6;
    }

    /* ── Skeleton ── */
    .skeleton-pulse {
      background: linear-gradient(90deg, var(--offwhite) 25%, var(--light) 50%, var(--offwhite) 75%);
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.4s ease infinite;
      border-radius: var(--radius);
    }
    @keyframes skeleton-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .blog-card-skeleton { height: 300px; }

    /* ── Error / empty ── */
    .rwgps-error {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: #fff3f3;
      border-left: 3px solid var(--red);
      border-radius: 0 var(--radius) var(--radius) 0;
      font-size: 14px;
      color: var(--gray);
    }
    .rwgps-retry-btn {
      background: none;
      border: 1px solid var(--red);
      color: var(--red);
      padding: 6px 14px;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 13px;
      white-space: nowrap;
    }
    .rwgps-empty { padding: 32px 0; color: var(--gray); font-size: 14px; }
    .rwgps-load-more { margin-top: 40px; text-align: center; }
  </style>
  <script src="/js/consent.js"></script>
</head>
<body data-page="blog">

<div data-component="nav"></div>

<div class="page-hero page-hero--photo" style="background-image: url('/images/cafe_stop_hero2.jpg');">
  <div class="page-hero-overlay"></div>
  <div class="page-hero-content">
    <div class="section-label">From the road</div>
    <h1>Ride<br>writeups</h1>
    <p>Stories from the Holme Valley, the hills beyond, and the café stops in between.</p>
  </div>
</div>

<div style="padding: 80px 32px; background: var(--white);">
  <div style="max-width: var(--max-w); margin: 0 auto;">

    <div data-reveal>
      <div class="section-label">Recent rides</div>
      <h2 class="section-title">On the road with HCC</h2>
      <p class="section-body" style="max-width: 580px; margin-bottom: 48px;">
        Every completed club trip appears here. Click through to see the route, photos, and stats.
      </p>
    </div>

    <!-- Live blog feed — populated by main.js → loadBlogPage() -->
    <div id="blog-list" data-reveal data-reveal-delay="1">
      <!-- Skeleton rendered here while loading -->
    </div>

  </div>
</div>

  <!-- ── Report detail modal ── -->
  <div id="blog-detail-overlay" style="display:none;position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.6);align-items:flex-start;justify-content:center;overflow-y:auto;padding:2rem 1rem">
    <div style="background:#fff;border-radius:8px;max-width:780px;width:100%;padding:2rem 2.5rem;position:relative;margin:auto">
      <button id="blog-overlay-close" aria-label="Close" style="position:absolute;top:1rem;right:1.25rem;background:none;border:none;font-size:1.5rem;cursor:pointer;color:#888;line-height:1">&#x2715;</button>
      <div id="blog-detail-content"></div>
    </div>
  </div>

  <!-- ── CTA ── -->
  <div style="background:var(--black);padding:80px 32px;">
    <div style="max-width:var(--max-w);margin:0 auto;text-align:center">
      <div class="section-label" style="color:#888;margin-bottom:12px">Come and ride with us</div>
      <h2 style="font-family:var(--font-display);font-size:clamp(2rem,5vw,3rem);font-weight:800;text-transform:uppercase;color:var(--white);letter-spacing:.02em;line-height:1.1;margin-bottom:16px">Want to join us<br>on a ride?</h2>
      <p style="color:#aaa;font-size:1rem;max-width:480px;margin:0 auto 32px;line-height:1.7">Non-members are welcome to take a trial ride before committing. Come and see what we're about.</p>
      <a href="/join.html" class="btn btn-red" style="font-size:1rem;padding:.85rem 2.25rem;letter-spacing:.06em">Take a trial ride &rarr;</a>
    </div>
  </div>

<div data-component="footer"></div>

<script src="/js/components.js"></script>
<script type="module" src="/js/main.js"></script>

  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW:', err));
      });
    }
  </script>
</body>
</html>

`;

const CACHE_TTL = {
  events:      15 * 60,
  event:       30 * 60,
  routes:      60 * 60,
  route:       60 * 60,
  trips:       15 * 60,
  trip:        60 * 60,
};

// ─── CORS headers ────────────────────────────────────────────────────────────
function corsHeaders(origin) {
  const allowed = [
    'https://www.holmfirth.cc',
    'https://holmfirth.cc',
    'https://holmfirth-cc.pages.dev',
    'https://test.holmfirth.cc',
  ];
  const allowedOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// ─── Auth headers for RWGPS ──────────────────────────────────────────────────
function rwgpsAuth(env) {
  return {
    'x-rwgps-api-key':    env.RWGPS_API_KEY,
    'x-rwgps-auth-token': env.RWGPS_AUTH_TOKEN,
    'Accept': 'application/json',
  };
}

// ─── Fetch a single page from RWGPS with Cloudflare edge cache ───────────────
async function rwgpsFetch(path, env, ttl) {
  const url      = `${RWGPS_BASE}${path}`;
  const cacheKey = new Request(url, { method: 'GET' });
  const cache    = caches.default;

  let cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: { ...Object.fromEntries(cached.headers), 'X-Cache': 'HIT' },
    });
  }

  const upstream = await fetch(url, { headers: rwgpsAuth(env) });

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: `RWGPS returned ${upstream.status}`, path }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await upstream.text();

  const responseToCache = new Response(body, {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Cache':       'MISS',
    },
  });
  await cache.put(cacheKey, responseToCache.clone());

  return new Response(body, {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Cache':       'MISS',
    },
  });
}

// ─── Fetch all upcoming events across all RWGPS pages ────────────────────────
// RWGPS returns events in an unpredictable mix of past/future, so we fetch all
// pages and filter client-side.  We pass events through if we cannot determine
// their date (defensive: let the client filter handle it) rather than silently
// dropping them.
async function fetchAllUpcomingEvents(env) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  let page = 1;
  let allEvents = [];

  while (true) {
    const res  = await rwgpsFetch(`/events.json?page=${page}&page_size=50`, env, CACHE_TTL.events);
    const data = await res.json();
    const events = data.events || [];

    // Keep events on/after today; if date is indeterminate, keep the event
    // (the client-side filter in rides.html will handle it).
    const upcoming = events.filter(e => {
      const d = e.start_date || (e.starts_at ? e.starts_at.slice(0, 10) : null);
      if (!d) return true;          // unknown date → pass through
      return d >= today;
    });
    allEvents = allEvents.concat(upcoming);

    // Stop if RWGPS has no further pages, or safety cap
    if (!data.meta?.pagination?.next_page_url) break;
    if (page >= 10) break;
    page++;
  }

  // Sort ascending by start date (undated events go to the end)
  allEvents.sort((a, b) => {
    const da = a.start_date || (a.starts_at ? a.starts_at.slice(0, 10) : 'zzzz');
    const db = b.start_date || (b.starts_at ? b.starts_at.slice(0, 10) : 'zzzz');
    return da.localeCompare(db);
  });

  return allEvents;
}

// ─── Route dispatcher ────────────────────────────────────────────────────────
async function handleRequest(request, env) {
  const url    = new URL(request.url);
  const path   = url.pathname;
  const origin = request.headers.get('Origin') || '';
  const cors   = corsHeaders(origin);
  const clubId = env.RWGPS_CLUB_ID;

  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ── /api/events ─────────────────────────────────────────
  if (path === '/api/events') {
    const events = await fetchAllUpcomingEvents(env);
    return new Response(
      JSON.stringify({ events, meta: { source: 'holmfirth-cc-worker' } }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  // ── /api/events/:id ─────────────────────────────────────
  const eventMatch = path.match(/^\/api\/events\/(\d+)$/);
  if (eventMatch) {
    const res = await rwgpsFetch(
      `/events/${eventMatch[1]}.json`,
      env, CACHE_TTL.event
    );
    return addCors(res, cors);
  }

  // ── /api/routes ─────────────────────────────────────────
  if (path === '/api/routes') {
    const page = url.searchParams.get('page') || '1';
    const res  = await rwgpsFetch(
      `/clubs/${clubId}/routes.json?page=${page}`,
      env, CACHE_TTL.routes
    );
    return addCors(res, cors);
  }

  // ── /api/routes/:id ─────────────────────────────────────
  const routeMatch = path.match(/^\/api\/routes\/(\d+)$/);
  if (routeMatch) {
    const res = await rwgpsFetch(
      `/routes/${routeMatch[1]}.json`,
      env, CACHE_TTL.route
    );
    return addCors(res, cors);
  }

  // ── /api/trips ──────────────────────────────────────────
  if (path === '/api/trips') {
    const page = url.searchParams.get('page') || '1';
    const res  = await rwgpsFetch(
      `/clubs/${clubId}/trips.json?page=${page}`,
      env, CACHE_TTL.trips
    );
    return addCors(res, cors);
  }

  // ── /api/trips/:id ──────────────────────────────────────
  const tripMatch = path.match(/^\/api\/trips\/(\d+)$/);
  if (tripMatch) {
    const res = await rwgpsFetch(
      `/trips/${tripMatch[1]}.json`,
      env, CACHE_TTL.trip
    );
    return addCors(res, cors);
  }

  // ── /api/committee ────────────────────────────────────────
  if (path === '/api/committee') {
    const membersUrl = env.MEMBERS_URL || 'https://members.holmfirth.cc';
    try {
      const res = await fetch(`${membersUrl}/api/public/committee`);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ members: [] }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  }

  // ── /api/committee/:id/avatar ───────────────────────────
  const committeeAvatarMatch = path.match(/^\/api\/committee\/([^/]+)\/avatar$/);
  if (committeeAvatarMatch) {
    const membersUrl = env.MEMBERS_URL || 'https://members.holmfirth.cc';
    try {
      const res = await fetch(`${membersUrl}/api/public/committee/${committeeAvatarMatch[1]}/avatar`);
      if (!res.ok) return new Response('Not found', { status: 404 });
      const ct = res.headers.get('Content-Type') || 'image/jpeg';
      return new Response(res.body, {
        headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600', ...cors },
      });
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
  }

  // ── /api/health ─────────────────────────────────────────
  if (path === '/api/health') {
    return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ── /blog — serve with OG tags if ?report= param present ──────────────────
  // Debug endpoint — remove after testing
  if (path === '/blog-debug') {
    const reportId = url.searchParams.get('report');
    try {
      const MEMBERS = 'https://members.holmfirth.cc';
      const apiRes = await fetch(`${MEMBERS}/api/public/ride-reports/${reportId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HolmfirthCC-Worker/1.0)', 'Accept': 'application/json' }
      });
      const body = await apiRes.text();
      return new Response(JSON.stringify({ status: apiRes.status, body }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), { headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (path === '/blog') {
    const reportId = url.searchParams.get('report');
    // Serve blog.html directly from embedded constant to avoid bot-blocking on env.ASSETS
    if (!reportId) return new Response(BLOG_HTML, { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' } });

    // Fetch report from members public API and inject OG tags
    try {
      const MEMBERS = 'https://members.holmfirth.cc';
      const apiRes  = await fetch(`${MEMBERS}/api/public/ride-reports/${reportId}`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HolmfirthCC-Worker/1.0)', 'Accept': 'application/json' } });
      if (!apiRes.ok) return new Response(BLOG_HTML, { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' } });
      const r = await apiRes.json();

      const title   = (r.title || 'Ride Report') + ' — Holmfirth Cycle Club';
      const dist    = r.distance_miles ? parseFloat(r.distance_miles).toFixed(0) + ' miles' : '';
      const elev    = r.elevation_ft   ? Math.round(r.elevation_ft) + 'ft' : '';
      const stats   = [dist, elev].filter(Boolean).join(' · ');
      const excerpt = r.body ? r.body.replace(/<[^>]+>/g, '').slice(0, 200).trim() : '';
      const desc    = [stats, excerpt].filter(Boolean).join(' — ') || 'A ride report from Holmfirth Cycle Club.';
      const pageUrl = `https://www.holmfirth.cc/blog?report=${reportId}`;
      const imgUrl  = r.map_image_key
        ? `${MEMBERS}/ride-report-images/${r.map_image_key.replace('ride-reports/', '')}`
        : 'https://www.holmfirth.cc/images/cafe_stop_hero2.jpg';

      const ogTags = `
  <meta property="og:type"        content="article" />
  <meta property="og:title"       content="${title.replace(/"/g, '&quot;')}" />
  <meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />
  <meta property="og:url"         content="${pageUrl}" />
  <meta property="og:image"       content="${imgUrl}" />
  <meta property="og:site_name"   content="Holmfirth Cycle Club" />
  <meta name="twitter:card"       content="summary_large_image" />
  <meta name="twitter:title"      content="${title.replace(/"/g, '&quot;')}" />
  <meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}" />
  <meta name="twitter:image"      content="${imgUrl}" />`;

      const html = BLOG_HTML;
      const injected = html.replace('</head>', ogTags + '\n</head>');
      return new Response(injected, {
        status: 200,
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'no-store',
        },
      });
    } catch (e) {
      return new Response(BLOG_HTML, { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' } });
    }
  }

  // Clean URL routing — map /about -> /about.html etc.
  const cleanUrls = {
    '/about':   '/about.html',
    '/rides':   '/rides.html',
    '/contact': '/contact.html',
    '/join':    '/join.html',
    '/privacy':      '/privacy.html',
    '/womens-ride':  '/womens-ride.html',
  };
  if (cleanUrls[path]) {
    const rewritten = new Request(new URL(cleanUrls[path], request.url).toString(), { method: 'GET', headers: { 'Accept': 'text/html' } });
    return noStoreHtml(await env.ASSETS.fetch(rewritten));
  }

  // Fall through to static assets for all other routes
  // Strip UA on asset fetches to avoid bot-blocking subrequests
  const cleanReq = new Request(request.url, {
    method: request.method,
    headers: { 'Accept': request.headers.get('Accept') || '*/*' },
  });
  return noStoreHtml(await env.ASSETS.fetch(cleanReq));
}

// Strip Cloudflare edge caching from HTML responses
function noStoreHtml(response) {
  const ct = response.headers.get('Content-Type') || '';
  if (!ct.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, must-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Surrogate-Control', 'no-store');
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}

function addCors(response, cors) {
  const headers = new Headers(response.headers);
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, headers });
}

// ─── Entry point ─────────────────────────────────────────────────────────────
export default {
  fetch: handleRequest,
};

