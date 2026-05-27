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

  // ── /api/health ─────────────────────────────────────────
  if (path === '/api/health') {
    return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Clean URL routing — map /about -> /about.html etc.
  const cleanUrls = {
    '/about':   '/about.html',
    '/rides':   '/rides.html',
    '/contact': '/contact.html',
    '/join':    '/join.html',
    '/blog':    '/blog.html',
  };
  if (cleanUrls[path]) {
    const rewritten = new Request(new URL(cleanUrls[path], request.url).toString(), request);
    return noStoreHtml(await env.ASSETS.fetch(rewritten));
  }

  // Fall through to static assets for all other routes
  return noStoreHtml(await env.ASSETS.fetch(request));
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
