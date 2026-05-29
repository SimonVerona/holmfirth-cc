/**
 * js/main.js — Holmfirth CC
 * Nav, scroll reveal, and page-specific RWGPS data loading.
 */

import {
  getEvents,
  getTrips,
  renderEventList,
  renderTripCards,
  showLoading,
  showError,
} from './rwgps.js';

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
  if (page === 'blog') loadBlogPage();
});

// ─── Home page — upcoming rides preview (3 items) ────────────────────────────
async function loadHomeEvents() {
  const container = document.getElementById('home-events');
  if (!container) return;

  showLoading(container, 3, 'event-row-skeleton');

  try {
    const data = await getEvents();
    renderEventList(container, data.events ?? [], { limit: 3 });
  } catch (err) {
    showError(container, 'Could not load events right now.', loadHomeEvents);
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
    const reports = data.reports ?? [];

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

      const imgStyle = r.map_image_key
        ? `background-image:url('${MEMBERS_API}/ride-report-images/${r.map_image_key.replace('ride-reports/','')}');background-size:cover;background-position:center`
        : '';
      const imgClass = r.map_image_key ? 'blog-card-img' : 'blog-card-img blog-card-img--placeholder';

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
    overlay.style.display = 'none'; document.body.style.overflow = '';
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { overlay.style.display = 'none'; document.body.style.overflow = ''; }
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
