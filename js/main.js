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

  if (page === 'home')   loadHomeEvents();
  if (page === 'events') loadEventsPage();
  if (page === 'blog')   loadBlogPage();
});

// ─── Home page — upcoming events preview (3 items) ───────────────────────────
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

// ─── Events page — full calendar ─────────────────────────────────────────────
async function loadEventsPage() {
  const container = document.getElementById('events-list');
  if (!container) return;

  showLoading(container, 5, 'event-row-skeleton');

  let page = 1;
  let allEvents = [];

  try {
    // Load first page; add a "load more" button if pagination exists
    const data = await getEvents(page);
    allEvents   = data.events ?? [];
    renderEventList(container, allEvents);

    const pagination = data.meta?.pagination;
    if (pagination?.next_page_url) {
      appendLoadMore(container, async () => {
        page++;
        const more = await getEvents(page);
        allEvents = [...allEvents, ...(more.events ?? [])];
        renderEventList(container, allEvents);
        if (!more.meta?.pagination?.next_page_url) {
          container.querySelector('.rwgps-load-more')?.remove();
        }
      });
    }
  } catch (err) {
    showError(container, 'Could not load events right now.', loadEventsPage);
  }
}

// ─── Blog page — trip writeups ────────────────────────────────────────────────
async function loadBlogPage() {
  const container = document.getElementById('blog-list');
  if (!container) return;

  showLoading(container, 6, 'blog-card-skeleton');

  let page = 1;
  let allTrips = [];

  try {
    const data = await getTrips(page);
    allTrips    = data.trips ?? [];
    renderTripCards(container, allTrips);

    if (data.meta?.pagination?.next_page_url) {
      appendLoadMore(container, async () => {
        page++;
        const more = await getTrips(page);
        allTrips = [...allTrips, ...(more.trips ?? [])];
        renderTripCards(container, allTrips);
        if (!more.meta?.pagination?.next_page_url) {
          container.querySelector('.rwgps-load-more')?.remove();
        }
      });
    }
  } catch (err) {
    showError(container, 'Could not load ride writeups right now.', loadBlogPage);
  }
}

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
