/**
 * Component loader — fetches shared HTML partials and injects them into
 * placeholder elements.  Usage:
 *
 *   <div data-component="nav"></div>
 *   <div data-component="footer"></div>
 *
 * After each component is injected a custom event is dispatched on document:
 *   document.addEventListener('component:nav', initNav);
 */
(function () {
  'use strict';

  // ── Post-inject callbacks ────────────────────────────────────────────────────

  function initNav() {
    // Mobile toggle
    const toggle = document.querySelector('.nav-toggle');
    const links  = document.querySelector('.nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', () => links.classList.toggle('open'));
      links.querySelectorAll('a').forEach(a =>
        a.addEventListener('click', () => links.classList.remove('open'))
      );
    }

    // Active link — match on filename, treat '' as index.html
    const current = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(a => {
      if (a.getAttribute('href') === current) a.classList.add('active');
    });
  }

  // Map component name → callback to run after injection
  const callbacks = {
    nav: initNav,
  };

  // ── Loader ───────────────────────────────────────────────────────────────────

  function loadComponents() {
    const placeholders = document.querySelectorAll('[data-component]');
    if (!placeholders.length) return;

    placeholders.forEach(function (el) {
      const name = el.getAttribute('data-component');
      fetch('components/' + name + '.html')
        .then(function (res) {
          if (!res.ok) throw new Error('Failed to load component: ' + name);
          return res.text();
        })
        .then(function (html) {
          el.outerHTML = html;
          if (callbacks[name]) callbacks[name]();
          document.dispatchEvent(new CustomEvent('component:' + name));
        })
        .catch(function (err) {
          console.error(err);
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadComponents);
  } else {
    loadComponents();
  }
})();
