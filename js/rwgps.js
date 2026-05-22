/**
 * js/rwgps.js — Holmfirth CC client-side API module
 *
 * All data fetching goes through this module. Pages never call /api/ directly.
 * The module abstracts the Worker endpoints and provides helpers for
 * rendering events, routes and trip writeups.
 *
 * Usage:
 *   import { getEvents, getRoutes, getTrips } from './rwgps.js';
 *   const { events } = await getEvents();
 */

// ─── Config ──────────────────────────────────────────────────────────────────
// In local dev (wrangler dev) the worker runs on the same origin.
// In production it is also same-origin (Pages + Worker in same project).
const API_BASE = '/api';

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
async function apiFetch(path) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// ─── Events ──────────────────────────────────────────────────────────────────

/**
 * Fetch upcoming club events from RWGPS.
 * Returns { events: [], meta: {} }
 */
export async function getEvents(page = 1) {
  return apiFetch(`/events?page=${page}`);
}

/**
 * Fetch a single event with full details (description, routes).
 * Returns { event: {} }
 */
export async function getEvent(id) {
  return apiFetch(`/events/${id}`);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Fetch club route library.
 * Returns { routes: [], meta: {} }
 */
export async function getRoutes(page = 1) {
  return apiFetch(`/routes?page=${page}`);
}

/**
 * Fetch a single route with full track data.
 * Returns { route: {} }
 */
export async function getRoute(id) {
  return apiFetch(`/routes/${id}`);
}

// ─── Trips (ride writeups / blog) ────────────────────────────────────────────

/**
 * Fetch recent club trips — these are completed rides and form the blog feed.
 * Returns { trips: [], meta: {} }
 */
export async function getTrips(page = 1) {
  return apiFetch(`/trips?page=${page}`);
}

/**
 * Fetch a single trip with full detail.
 * Returns { trip: {} }
 */
export async function getTrip(id) {
  return apiFetch(`/trips/${id}`);
}

// ─── Rendering helpers ───────────────────────────────────────────────────────

/**
 * Format a RWGPS datetime string to a human-readable date.
 * e.g. "2026-06-01T09:00:00Z" → "Sun 1 Jun 2026"
 */
export function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Format just day number + month abbreviation for the date box component.
 * Returns { day: "01", month: "Jun" }
 */
export function formatDateBox(isoString) {
  if (!isoString) return { day: '—', month: '—' };
  const d = new Date(isoString);
  return {
    day:   String(d.getDate()).padStart(2, '0'),
    month: d.toLocaleDateString('en-GB', { month: 'short' }),
  };
}

/**
 * Metres → km string. e.g. 48234 → "48.2 km"
 */
export function formatDistance(metres) {
  if (!metres) return '';
  return `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Metres → feet elevation string. e.g. 1240 → "1,240 m"
 */
export function formatElevation(metres) {
  if (!metres) return '';
  return `${Math.round(metres).toLocaleString('en-GB')} m`;
}

/**
 * Build a RWGPS event page URL from event id.
 */
export function rwgpsEventUrl(id) {
  return `https://ridewithgps.com/events/${id}`;
}

/**
 * Build a RWGPS route page URL from route id.
 */
export function rwgpsRouteUrl(id) {
  return `https://ridewithgps.com/routes/${id}`;
}

/**
 * Build a RWGPS trip page URL from trip id.
 */
export function rwgpsTripUrl(id) {
  return `https://ridewithgps.com/trips/${id}`;
}

/**
 * Render an event list into a container element.
 *
 * @param {HTMLElement} container
 * @param {Array}       events   — array of RWGPS event objects
 * @param {Object}      opts
 * @param {number}      opts.limit — max events to render (default: all)
 */
export function renderEventList(container, events, { limit } = {}) {
  const items = limit ? events.slice(0, limit) : events;

  if (!items.length) {
    container.innerHTML = `
      <p class="rwgps-empty">No upcoming events found. Check back soon.</p>`;
    return;
  }

  container.innerHTML = items.map(event => {
    const { day, month } = formatDateBox(event.starts_at || event.created_at);
    const dist = event.distance ? formatDistance(event.distance) : '';
    const elev = event.elevation_gain ? `↑ ${formatElevation(event.elevation_gain)}` : '';
    const meta = [event.location, dist, elev].filter(Boolean).join(' · ');

    return `
      <div class="event-row">
        <div class="event-date-box">
          <div class="event-date-day">${day}</div>
          <div class="event-date-month">${month}</div>
        </div>
        <div class="event-body">
          <div class="event-name">
            <a href="${rwgpsEventUrl(event.id)}" target="_blank" rel="noopener">${escHtml(event.name)}</a>
          </div>
          ${meta ? `<div class="event-meta">${escHtml(meta)}</div>` : ''}
        </div>
        <span class="event-tag ride">Club ride</span>
      </div>`;
  }).join('');
}

/**
 * Render a trip/blog card list into a container element.
 *
 * @param {HTMLElement} container
 * @param {Array}       trips   — array of RWGPS trip objects
 * @param {Object}      opts
 * @param {number}      opts.limit — max trips to render
 */
export function renderTripCards(container, trips, { limit } = {}) {
  const items = limit ? trips.slice(0, limit) : trips;

  if (!items.length) {
    container.innerHTML = `
      <p class="rwgps-empty">No ride writeups yet. Check back after the next club run!</p>`;
    return;
  }

  container.innerHTML = `<div class="blog-grid">${items.map(trip => {
    const dist = trip.distance ? formatDistance(trip.distance) : '';
    const elev = trip.elevation_gain ? `↑ ${formatElevation(trip.elevation_gain)}` : '';
    const stats = [dist, elev].filter(Boolean).join(' · ');
    const date  = formatDate(trip.departed_at || trip.created_at);
    const thumb = trip.highlight_photo?.url || '';

    return `
      <article class="blog-card" data-trip-id="${trip.id}">
        ${thumb
          ? `<div class="blog-card-img" style="background-image:url('${thumb}')"></div>`
          : `<div class="blog-card-img blog-card-img--placeholder"></div>`
        }
        <div class="blog-card-body">
          <div class="blog-card-date">${escHtml(date)}</div>
          <h3 class="blog-card-title">
            <a href="${rwgpsTripUrl(trip.id)}" target="_blank" rel="noopener">${escHtml(trip.name)}</a>
          </h3>
          ${stats ? `<div class="blog-card-stats">${escHtml(stats)}</div>` : ''}
          ${trip.description
            ? `<p class="blog-card-excerpt">${escHtml(truncate(trip.description, 120))}</p>`
            : ''}
        </div>
      </article>`;
  }).join('')}</div>`;
}

// ─── Loading / error state helpers ───────────────────────────────────────────

/**
 * Show a loading skeleton inside container.
 * Pass skeletonClass to use the right CSS class for the context.
 */
export function showLoading(container, rows = 3, skeletonClass = 'event-row-skeleton') {
  container.innerHTML = Array.from({ length: rows }, () =>
    `<div class="${skeletonClass} skeleton-pulse"></div>`
  ).join('');
}

/**
 * Show an inline error message with an optional retry link.
 */
export function showError(container, message, onRetry) {
  container.innerHTML = `
    <div class="rwgps-error">
      <span>${escHtml(message)}</span>
      ${onRetry
        ? `<button class="rwgps-retry-btn" type="button">Try again</button>`
        : ''}
    </div>`;
  if (onRetry) {
    container.querySelector('.rwgps-retry-btn')?.addEventListener('click', onRetry);
  }
}

// ─── Private utilities ───────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, maxLen) {
  if (!str) return '';
  const plain = str.replace(/[#*_[\]()~`>+=|{}.!-]/g, '').trim();
  return plain.length > maxLen ? plain.slice(0, maxLen).trimEnd() + '…' : plain;
}
