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
 *   GET /api/events          — upcoming club events
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
// Locked to your own domain in production; expand as needed.
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
    'Authorization': `Bearer ${env.RWGPS_AUTH_TOKEN}`,
    'x-rwgps-api-key': env.RWGPS_API_KEY,
    'Accept': 'application/json',
  };
}

// ─── Fetch from RWGPS with Cloudflare cache ──────────────────────────────────
async function rwgpsFetch(path, env, ttl) {
  const url = `${RWGPS_BASE}${path}`;
  const cacheKey = new Request(url, { method: 'GET' });
  const cache    = caches.default;

  // Try Cloudflare edge cache first
  let cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: { ...Object.fromEntries(cached.headers), 'X-Cache': 'HIT' },
    });
  }

  // Forward to RWGPS
  const upstream = await fetch(url, { headers: rwgpsAuth(env) });

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: `RWGPS returned ${upstream.status}`, path }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await upstream.text();

  // Store in edge cache
  const responseToCache = new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Cache': 'MISS',
    },
  });
  await cache.put(cacheKey, responseToCache.clone());

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Cache': 'MISS',
    },
  });
}

// ─── Route dispatcher ────────────────────────────────────────────────────────
async function handleRequest(request, env) {
  const url    = new URL(request.url);
  const path   = url.pathname;           // e.g. /api/events
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
    // page param passed through; ?page=1 etc.
    const page = url.searchParams.get('page') || '1';
    const res  = await rwgpsFetch(
      `/clubs/${clubId}/events.json?page=${page}`,
      env, CACHE_TTL.events
    );
    return addCors(res, cors);
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
  // Trips = completed ride writeups. Fetched for the club user account.
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
    return env.ASSETS.fetch(rewritten);
  }

  // Fall through to static assets for all other routes
  return env.ASSETS.fetch(request);
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
