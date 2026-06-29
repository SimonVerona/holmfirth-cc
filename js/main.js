/**
 * js/main.js — Holmfirth CC
 * Nav, scroll reveal, and page-specific RWGPS data loading.
 */

import {
  getEvents,
  getEvent,
  getRoute,
  getTrips,
  renderTripCards,
  showLoading,
  showError,
  formatDateBox,
  formatDistance,
  formatElevation,
} from './rwgps.js';
import { trackEvent } from './analytics.js';

// ─── Nav ──────────────────────────────────────────────────────────────────────
// Nav toggle and active-link logic is handled in js/components.js after the
// shared nav component is injected.

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Scroll reveal
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target); }
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('[data-reveal]').forEach(el => obs.observe(el));
  } else {
    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('revealed'));
  }

  // ── Page-specific data loading ──────────────────────────────────────────────
  const page = document.body.dataset.page;

  if (page === 'home') loadHomeEvents();
  if (page === 'blog') {
    loadBlogPage().then(() => {
      const reportParam = new URLSearchParams(window.location.search).get('report');
      if (reportParam) showBlogReport(reportParam);
    });
  }
});

// ─── Home page — rides this week (full card + modal, mirrors rides.html) ──────

const escHtml = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function decimate(pts, maxPts = 300) {
  if (pts.length <= maxPts) return pts;
  const step = Math.ceil(pts.length / maxPts);
  return pts.filter((_, i) => i % step === 0);
}

function renderMiniMap(containerId, trackPoints) {
  const el = document.getElementById(containerId);
  if (!el || !trackPoints || !trackPoints.length) return;
  const pts = decimate(trackPoints, 200).map(p => [p.y, p.x]);
  const map = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  const poly = L.polyline(pts, { color: '#D0021B', weight: 2.5, opacity: 0.9 }).addTo(map);
  map.fitBounds(poly.getBounds(), { padding: [6, 6] });
}

let homeModalMap  = null;
let homeElevChart = null;

function openHomeModal(eventData) {
  const { event, route, trackPoints } = eventData;
  const overlay = document.getElementById('ev-modal-overlay');
  if (!overlay) return;

  document.getElementById('ev-modal-title').textContent = event.name;
  const dateStr = new Date(event.start_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('ev-modal-date').textContent = event.start_time ? `${dateStr} · ${event.start_time.slice(0,5)}` : dateStr;

  const dist    = route && route.distance      ? formatDistance(route.distance) : null;
  const elev    = route && route.elevation_gain ? formatElevation(route.elevation_gain) : null;
  const diff    = route && route.difficulty    ? route.difficulty.charAt(0).toUpperCase() + route.difficulty.slice(1) : null;
  const terrain = route && route.terrain       ? route.terrain.charAt(0).toUpperCase() + route.terrain.slice(1) : null;
  const stats   = [
    dist    ? { label: 'Distance',   val: dist }        : null,
    elev    ? { label: 'Elevation',  val: `↑ ${elev}` } : null,
    diff    ? { label: 'Difficulty', val: diff }        : null,
    terrain ? { label: 'Terrain',   val: terrain }      : null,
  ].filter(Boolean);
  document.getElementById('ev-modal-stats').innerHTML = stats.map(s =>
    `<div><div class="ev-modal-stat-label">${s.label}</div><div class="ev-modal-stat-val">${escHtml(s.val)}</div></div>`
  ).join('');

  const locEl = document.getElementById('ev-modal-location');
  locEl.innerHTML = event.location ? `<strong>Meeting point:</strong> ${escHtml(event.location)}` : '';

  const descEl = document.getElementById('ev-modal-desc');
  descEl.textContent = event.description || (route && route.description) || '';
  descEl.style.display = descEl.textContent ? 'block' : 'none';

  overlay.classList.add('open');

  // Map
  const mapEl = document.getElementById('ev-modal-map');
  if (homeModalMap) { homeModalMap.remove(); homeModalMap = null; }
  mapEl.innerHTML = '';
  if (trackPoints && trackPoints.length) {
    const pts = decimate(trackPoints, 400).map(p => [p.y, p.x]);
    homeModalMap = L.map(mapEl, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
    }).addTo(homeModalMap);
    const startPt = trackPoints[0];
    L.circleMarker([startPt.y, startPt.x], { radius: 7, color: '#fff', fillColor: '#22c55e', fillOpacity: 1, weight: 2 })
      .bindTooltip('Start').addTo(homeModalMap);
    const poly = L.polyline(pts, { color: '#D0021B', weight: 3, opacity: 0.9 }).addTo(homeModalMap);
    homeModalMap.fitBounds(poly.getBounds(), { padding: [20, 20] });
  } else if (event.lat && event.lng) {
    homeModalMap = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([event.lat, event.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
    }).addTo(homeModalMap);
    L.marker([event.lat, event.lng]).addTo(homeModalMap);
  } else {
    mapEl.innerHTML = '<p style="padding:20px;color:var(--gray);text-align:center">No route map available</p>';
  }

  // Elevation chart
  const elevWrap = document.getElementById('ev-modal-elev-wrap');
  if (homeElevChart) { homeElevChart.destroy(); homeElevChart = null; }
  if (trackPoints && trackPoints.length) {
    elevWrap.style.display = 'block';
    const sampled = decimate(trackPoints, 400);
    const labels  = sampled.map(p => (p.d / 1000).toFixed(1));
    const elevFt  = sampled.map(p => Math.round(p.e * 3.28084));
    const ctx     = document.getElementById('ev-modal-elev-chart').getContext('2d');
    homeElevChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: elevFt,
          borderColor: '#D0021B',
          backgroundColor: 'rgba(208,2,27,0.1)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        }]
      },
      options: {
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, font: { size: 11 } }, title: { display: true, text: 'Distance (km)', font: { size: 11 } } },
          y: { ticks: { font: { size: 11 } }, title: { display: true, text: 'Elevation (ft)', font: { size: 11 } } }
        }
      }
    });
  } else {
    elevWrap.style.display = 'none';
  }
}

function closeHomeModal() {
  const overlay = document.getElementById('ev-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

function resetHomeTrialForm() {
  ['trial-first-name','trial-last-name','trial-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('input-error'); }
  });
  const errEl = document.getElementById('trial-signup-error');
  if (errEl) errEl.classList.remove('visible');
  const btn = document.getElementById('btn-trial-signup');
  if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
}

function initHomeModal() {
  const overlay = document.getElementById('ev-modal-overlay');
  if (!overlay) return;

  document.getElementById('ev-modal-close').addEventListener('click', () => {
    closeHomeModal();
    resetHomeTrialForm();
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { closeHomeModal(); resetHomeTrialForm(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHomeModal(); });

  // Join-ride button on card -> open modal then scroll to signup
  document.getElementById('upcoming-events').addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-join-ride');
    if (!btn) return;
    e.stopPropagation();
    btn.closest('.event-card').click();
    setTimeout(() => {
      document.getElementById('trial-signup-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
  });

  // Trial signup submit
  document.getElementById('btn-trial-signup').addEventListener('click', async function() {
    const firstName = document.getElementById('trial-first-name').value.trim();
    const lastName  = document.getElementById('trial-last-name').value.trim();
    const email     = document.getElementById('trial-email').value.trim();
    const errorEl   = document.getElementById('trial-signup-error');

    errorEl.classList.remove('visible');
    ['trial-first-name','trial-last-name','trial-email'].forEach(id => {
      document.getElementById(id).classList.remove('input-error');
    });

    let valid = true;
    if (!firstName) { document.getElementById('trial-first-name').classList.add('input-error'); valid = false; }
    if (!lastName)  { document.getElementById('trial-last-name').classList.add('input-error');  valid = false; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById('trial-email').classList.add('input-error'); valid = false;
    }
    if (!valid) {
      errorEl.textContent = 'Please fill in all fields with a valid email address.';
      errorEl.classList.add('visible');
      return;
    }

    const btn = document.getElementById('btn-trial-signup');
    btn.classList.add('loading');
    btn.disabled = true;

    const eventName = document.getElementById('ev-modal-title').textContent || '';
    try {
      const res = await fetch('https://members.holmfirth.cc/api/trial/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, email, event_name: eventName }),
      });
      const data = await res.json();
      if (!res.ok && !data.ok) throw new Error(data.error || 'Sign-up failed. Please try again.');

      trackEvent('trial_ride_signup_complete', { event_name: eventName });
      closeHomeModal();
      resetHomeTrialForm();
      document.getElementById('thankyou-ride-name').textContent = eventName || 'your chosen ride';
      document.getElementById('thankyou-overlay').classList.add('open');
    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong. Please try again.';
      errorEl.classList.add('visible');
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });

  // Thank-you close
  document.getElementById('btn-thankyou-close').addEventListener('click', () => {
    document.getElementById('thankyou-overlay').classList.remove('open');
  });
  document.getElementById('thankyou-overlay').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
}

const HOME_GROUP_PILL_COLORS = { a: '#D0021B', b: '#2563EB', c: '#16A34A', d: '#EA580C', gravel: '#7C3AED', "women's": '#DB2777', womens: '#DB2777' };
function buildHomeGroupPills(groupsStr) {
  if (!groupsStr) return '';
  const pills = groupsStr.split(',').map(g => g.trim()).filter(Boolean).map(g => {
    const key = g.toLowerCase();
    const col = HOME_GROUP_PILL_COLORS[key] || '#888';
    const label = (key === "women's" || key === 'womens') ? "Women's" : g.toUpperCase();
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.05em;color:#fff;background:${col};line-height:1.6;">${label}</span>`;
  });
  return pills.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;">${pills.join('')}</div>` : '';
}

async function loadHomeEvents() {
  const container = document.getElementById('upcoming-events');
  if (!container) return;

  showLoading(container, 3, 'event-row-skeleton');
  initHomeModal();

  try {
    const { events = [] } = await getEvents();
    const todayStr   = new Date().toISOString().slice(0, 10);
    const cutoffDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const upcoming   = events.filter(e => {
      const d = e.start_date || (e.starts_at || '').slice(0, 10);
      return d >= todayStr && d <= cutoffDate;
    });

    if (!upcoming.length) {
      container.innerHTML = '<p class="rwgps-empty">No rides scheduled in the next seven days — check back soon.</p>';
      return;
    }

    const details = await Promise.all(
      upcoming.map(e => getEvent(e.id).catch(() => ({ event: e })))
    );
    const routeDetails = await Promise.all(
      details.map(({ event }) => {
        const r = event.routes && event.routes[0];
        return r ? getRoute(r.id).catch(() => null) : Promise.resolve(null);
      })
    );

    // Fetch ride group data from members portal
    const homeGroupsMap = {};
    try {
      const ids = upcoming.map(e => String(e.id));
      const gr = await fetch('https://members.holmfirth.cc/api/rides/events/groups?ids=' + ids.join(','));
      if (gr.ok) {
        const gd = await gr.json();
        (gd.groups || []).forEach(({event_id, groups}) => { homeGroupsMap[String(event_id)] = groups; });
      }
    } catch(e) {}

    container.innerHTML = '';
    details.forEach(({ event }, i) => {
      const routeMeta   = event.routes && event.routes[0];
      const routeFull   = routeDetails[i] ? routeDetails[i].route : null;
      const trackPoints = routeFull ? routeFull.track_points : null;
      const srcRoute    = routeMeta || routeFull;

      const { day, month } = formatDateBox(event.start_date || event.starts_at);
      const time      = event.start_time ? event.start_time.slice(0, 5) : '';
      const dist      = srcRoute && srcRoute.distance       ? formatDistance(srcRoute.distance) : '';
      const elev      = srcRoute && srcRoute.elevation_gain ? `↑ ${formatElevation(srcRoute.elevation_gain)}` : '';
      const routeName = (routeFull || routeMeta) ? (routeFull || routeMeta).name.trim() : '';
      const metaParts = [event.location, dist, elev].filter(Boolean);
      const metaLine  = [time, metaParts.join(' · ')].filter(Boolean).join(' · ');
      const miniMapId = `mini-map-${event.id}`;
      const pillsHtml = buildHomeGroupPills(homeGroupsMap[String(event.id)]);

      const card = document.createElement('div');
      card.className = 'event-card';
      card.innerHTML = `
        <div class="event-card-inner">
          <div class="event-date-box">
            <div class="event-date-day">${day}</div>
            <div class="event-date-month">${month}</div>
          </div>
          <div class="event-info">
            <div class="event-name">${escHtml(event.name)}</div>
            ${metaLine  ? `<div class="event-meta">${escHtml(metaLine)}</div>` : ''}
            ${routeName ? `<div class="event-route-name">${escHtml(routeName)}</div>` : ''}
            ${pillsHtml}
          </div>
          ${trackPoints ? `<div class="event-mini-map" id="${miniMapId}"></div>` : ''}
        </div>
        <div class="event-card-hint" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <span>Tap for map &amp; elevation profile →</span>
          <button class="btn-join-ride" data-event-id="${event.id}" data-event-name="${escHtml(event.name)}"
            style="background:var(--red);color:white;border:none;cursor:pointer;font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:6px 14px;border-radius:4px;white-space:nowrap;transition:background 0.15s;"
            onmouseover="this.style.background='#b0011a'" onmouseout="this.style.background='var(--red)'">
            JOIN THIS RIDE →
          </button>
        </div>`;

      card.addEventListener('click', () => openHomeModal(
        { event, route: routeFull || routeMeta, trackPoints }
      ));
      container.appendChild(card);

      if (trackPoints) {
        requestAnimationFrame(() => renderMiniMap(miniMapId, trackPoints));
      }
    });

  } catch (err) {
    showError(container, 'Could not load upcoming rides. Please try again shortly.');
  }
}

// ─── Blog page — ride reports from members API ───────────────────────────────
const MEMBERS_API = 'https://members.holmfirth.cc';

async function loadBlogPage() {
  const container = document.getElementById('blog-list');
  if (!container) return;

  // Show skeleton cards while loading
  showLoading(container, 6, 'blog-card-skeleton');

  try {
    const res  = await fetch(MEMBERS_API + '/api/ride-reports?limit=50&status=published');
    const data = await res.json();
    const reports = (data.reports ?? []).slice().sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

    container.innerHTML = '';

    if (!reports.length) {
      container.innerHTML = '<p class="rwgps-empty">No ride reports yet — check back soon.</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'blog-grid';

    reports.forEach(r => {
      const d       = new Date(r.event_date);
      const dateStr = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
      const dist    = r.distance_miles ? parseFloat(r.distance_miles).toFixed(0) + ' mi' : '';
      const elev    = r.elevation_ft   ? Math.round(r.elevation_ft) + ' ft'              : '';
      const time    = r.duration_secs  ? (Math.floor(r.duration_secs/3600) + ':' + String(Math.floor((r.duration_secs%3600)/60)).padStart(2,'0')) : '';
      const stats   = [dist, elev, time].filter(Boolean).join(' &middot; ');

      const cardImgKey = r.cover_image_key || r.map_image_key;
      const imgStyle = cardImgKey
        ? `background-image:url('${MEMBERS_API}/ride-report-images/${cardImgKey.replace('ride-reports/','')}');background-size:cover;background-position:center`
        : '';
      const imgClass = cardImgKey ? 'blog-card-img' : 'blog-card-img blog-card-img--placeholder';

      const card = document.createElement('article');
      card.className = 'blog-card';
      card.style.cursor = 'pointer';
      card.innerHTML =
        '<div class="' + imgClass + '" style="' + imgStyle + '"></div>' +
        '<div class="blog-card-body">' +
          '<div class="blog-card-date">' + dateStr + '</div>' +
          '<div class="blog-card-title">' + esc(r.title) + '</div>' +
          (stats ? '<div class="blog-card-stats">' + stats + '</div>' : '') +
          '<div class="blog-card-excerpt">By ' + esc(r.author_name) + '</div>' +
        '</div>';

      card.addEventListener('click', () => showBlogReport(r.id));
      grid.appendChild(card);
    });

    container.appendChild(grid);
  } catch (err) {
    showError(container, 'Could not load ride writeups right now.', loadBlogPage);
  }
}

// ─── Report detail modal ──────────────────────────────────────────────────────
async function showBlogReport(reportId) {
  const overlay = document.getElementById('blog-detail-overlay');
  const content = document.getElementById('blog-detail-content');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const newUrl = new URL(window.location.href); newUrl.searchParams.set('report', reportId); history.replaceState(null, '', newUrl.toString());
  content.innerHTML = '<div style="padding:40px 0;text-align:center;color:#888">Loading&hellip;</div>';

  try {
    const res = await fetch(MEMBERS_API + '/api/ride-reports/' + reportId);
    const r   = await res.json();

    const d       = new Date(r.event_date);
    const dateStr = d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const dist    = r.distance_miles ? parseFloat(r.distance_miles).toFixed(1) + ' miles' : '';
    const elev    = r.elevation_ft   ? Math.round(r.elevation_ft) + ' ft'                 : '';
    const time    = r.duration_secs  ? (Math.floor(r.duration_secs/3600) + ':' + String(Math.floor((r.duration_secs%3600)/60)).padStart(2,'0')) : '';

    const allImages = [];
    if (r.map_image_key) allImages.push(MEMBERS_API + '/ride-report-images/' + r.map_image_key.replace('ride-reports/',''));
    (r.images||[]).forEach(img => allImages.push(MEMBERS_API + '/ride-report-images/' + img.r2_key.replace('ride-reports/','')));

    const imgHtml = allImages.length
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:16px 0">' +
          allImages.map(src => '<img src="'+src+'" style="height:200px;width:auto;max-width:100%;object-fit:cover;border-radius:6px" alt="">').join('') +
        '</div>'
      : '';

    const statsHtml = (dist||elev||time)
      ? '<div style="display:flex;gap:24px;background:#f9f9f9;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;margin-bottom:16px;flex-wrap:wrap">' +
          (dist ? '<div><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#888">Distance</div><div style="font-family:var(--font-display);font-size:1.05rem;font-weight:700">' + dist + '</div></div>' : '') +
          (elev ? '<div><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#888">Elevation</div><div style="font-family:var(--font-display);font-size:1.05rem;font-weight:700">' + elev + '</div></div>' : '') +
          (time ? '<div><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#888">Time</div><div style="font-family:var(--font-display);font-size:1.05rem;font-weight:700">' + time + '</div></div>' : '') +
        '</div>'
      : '';

    content.innerHTML =
      '<div style="margin-bottom:20px">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--red);margin-bottom:6px">' + dateStr + '</div>' +
        '<h2 style="font-family:var(--font-display);font-size:clamp(1.4rem,4vw,2rem);font-weight:800;text-transform:uppercase;line-height:1.1;margin-bottom:6px">' + esc(r.title) + '</h2>' +
        '<div style="font-size:13px;color:#888">By ' + esc(r.author_name) + '</div>' +
      '</div>' +
      statsHtml +
      imgHtml +
      '<div style="font-size:15px;line-height:1.75;white-space:pre-wrap;color:#333;margin-top:8px">' + esc(r.description||'') + '</div>' +
      (r.recording_url ? '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb"><a href="'+r.recording_url+'" target="_blank" rel="noopener" style="font-size:13px;color:var(--red)">View original recording &#x2197;</a></div>' : '') +
      '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center">' +
        '<p style="font-size:13px;color:#888;margin-bottom:12px">Want to ride with us?</p>' +
        '<a href="/join.html" class="btn btn-red" style="font-size:.85rem">Take a trial ride &rarr;</a>' +
      '</div>';
  } catch(e) {
    content.innerHTML = '<p style="color:#b91c1c;padding:20px 0">Could not load this report.</p>';
  }
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Wire up modal close
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('blog-detail-overlay');
  if (!overlay) return;
  document.getElementById('blog-overlay-close').addEventListener('click', () => {
    overlay.style.display = 'none'; document.body.style.overflow = ''; const cu = new URL(window.location.href); cu.searchParams.delete('report'); history.replaceState(null, '', cu.pathname + (cu.search === '?' ? '' : cu.search));
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { overlay.style.display = 'none'; document.body.style.overflow = ''; const cu = new URL(window.location.href); cu.searchParams.delete('report'); history.replaceState(null, '', cu.pathname + (cu.search === '?' ? '' : cu.search)); }
  });
});

// ─── "Load more" button helper ────────────────────────────────────────────────
function appendLoadMore(container, onClick) {
  const existing = container.querySelector('.rwgps-load-more');
  if (existing) existing.remove();

  const btn = document.createElement('div');
  btn.className = 'rwgps-load-more';
  btn.innerHTML = `<button class="btn btn-outline-dark" type="button">Load more</button>`;
  btn.querySelector('button').addEventListener('click', async () => {
    btn.querySelector('button').textContent = 'Loading…';
    btn.querySelector('button').disabled = true;
    await onClick();
  });
  container.after(btn);
}
