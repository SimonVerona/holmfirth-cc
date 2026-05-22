/**
 * Component loader — fetches shared HTML partials and injects them into
 * placeholder elements.  Usage:
 *
 *   <div data-component="footer"></div>
 *
 * The placeholder is replaced entirely by the fetched partial.
 */
(function () {
  'use strict';

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
