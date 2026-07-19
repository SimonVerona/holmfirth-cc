/**
 * js/consent.js — Holmfirth CC
 *
 * Cookie consent management for GA4, Microsoft Clarity, and Facebook Pixel.
 * Must be loaded synchronously (no defer/async) before analytics scripts.
 *
 * Consent stored as JSON in localStorage under key 'hcc_consent':
 *   { version: 1, analytics: true|false, ts: <epoch ms> }
 *
 * Analytics scripts are injected into the DOM only after consent is granted.
 * Re-checking consent on every page load means revocation takes effect
 * immediately on next page visit without needing a full app reload.
 */

(function () {
  'use strict';

  // ── Replace these with your real measurement IDs before go-live ─────────────
  var GA_MEASUREMENT_ID  = 'G-7DC0SRE8Z6';
  var CLARITY_PROJECT_ID = 'x4ds9hgxqn';  // TODO: replace before go-live
  var FB_PIXEL_ID        = '1598335198547880';
  // ────────────────────────────────────────────────────────────────────────────

  var STORAGE_KEY     = 'hcc_consent';
  var CONSENT_VERSION = 1;

  // ── Read stored consent ─────────────────────────────────────────────────────
  function getStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj.version !== CONSENT_VERSION) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  function saveConsent(analytics) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version:   CONSENT_VERSION,
        analytics: analytics,
        ts:        Date.now(),
      }));
    } catch (e) {}
  }

  // ── Inject analytics scripts into <head> ────────────────────────────────────
  function loadGoogleAnalytics() {
    if (document.getElementById('hcc-ga-script')) return;
    var s1 = document.createElement('script');
    s1.id  = 'hcc-ga-script';
    s1.async = true;
    s1.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(s1);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
  }

  function loadClarity() {
    if (document.getElementById('hcc-clarity-script')) return;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.id = 'hcc-clarity-script'; t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);
  }

  function loadFacebookPixel() {
    if (document.getElementById('hcc-fb-script')) return;
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.id = 'hcc-fb-script'; t.async = true;
      t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', FB_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function activateAnalytics() {
    loadGoogleAnalytics();
    loadClarity();
    loadFacebookPixel();
  }

  // ── Banner UI ───────────────────────────────────────────────────────────────
  var BANNER_HTML =
    '<div id="hcc-consent-banner" role="dialog" aria-modal="true" aria-label="Cookie preferences" style="' +
      'position:fixed;bottom:0;left:0;right:0;z-index:99999;' +
      'background:#111;color:#f5f2ee;' +
      'padding:16px 20px;' +
      'display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;' +
      'font-family:\'Barlow\',sans-serif;font-size:14px;line-height:1.5;' +
      'box-shadow:0 -2px 12px rgba(0,0,0,0.4);' +
    '">' +
      '<div style="flex:1;min-width:220px;max-width:640px">' +
        '<strong style="font-family:\'Barlow Condensed\',sans-serif;font-size:16px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Cookie Settings</strong> ' +
        '<span style="color:rgba(245,242,238,0.75)">' +
          'We use cookies for analytics (Google Analytics, Microsoft Clarity) and marketing (Facebook). ' +
          'Essential cookies (login, session) are always active. ' +
          '<a href="/privacy" style="color:#D0021B;text-decoration:underline">Privacy policy</a>' +
        '</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">' +
        '<button id="hcc-consent-prefs" style="' +
          'background:transparent;color:#f5f2ee;border:1px solid rgba(245,242,238,0.4);' +
          'font-family:\'Barlow Condensed\',sans-serif;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
          'padding:8px 14px;border-radius:3px;cursor:pointer;white-space:nowrap' +
        '">Manage</button>' +
        '<button id="hcc-consent-reject" style="' +
          'background:transparent;color:#f5f2ee;border:1px solid rgba(245,242,238,0.4);' +
          'font-family:\'Barlow Condensed\',sans-serif;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
          'padding:8px 14px;border-radius:3px;cursor:pointer;white-space:nowrap' +
        '">Reject All</button>' +
        '<button id="hcc-consent-accept" style="' +
          'background:#D0021B;color:#fff;border:1px solid #D0021B;' +
          'font-family:\'Barlow Condensed\',sans-serif;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
          'padding:8px 14px;border-radius:3px;cursor:pointer;white-space:nowrap' +
        '">Accept All</button>' +
      '</div>' +
    '</div>';

  var PREFS_HTML =
    '<div id="hcc-consent-prefs-modal" role="dialog" aria-modal="true" aria-label="Cookie preferences" style="' +
      'position:fixed;inset:0;z-index:100000;' +
      'background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px' +
    '">' +
      '<div style="background:#111;color:#f5f2ee;border-radius:6px;max-width:480px;width:100%;padding:28px 24px;' +
               'font-family:\'Barlow\',sans-serif;font-size:14px;line-height:1.5;position:relative">' +
        '<h2 style="font-family:\'Barlow Condensed\',sans-serif;font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-bottom:20px">Cookie Preferences</h2>' +

        '<div style="margin-bottom:16px;padding:14px;background:#1a1a1a;border-radius:4px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
            '<strong style="font-family:\'Barlow Condensed\',sans-serif;font-size:15px;text-transform:uppercase">Essential</strong>' +
            '<span style="font-size:12px;color:rgba(245,242,238,0.5);font-style:italic">Always active</span>' +
          '</div>' +
          '<p style="color:rgba(245,242,238,0.7);font-size:13px;margin:0">' +
            'Session management and login. Required for the site to function. Cannot be disabled.' +
          '</p>' +
        '</div>' +

        '<div style="margin-bottom:20px;padding:14px;background:#1a1a1a;border-radius:4px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
            '<strong style="font-family:\'Barlow Condensed\',sans-serif;font-size:15px;text-transform:uppercase">Analytics &amp; Marketing</strong>' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
              '<input type="checkbox" id="hcc-analytics-toggle" style="width:16px;height:16px;cursor:pointer;accent-color:#D0021B">' +
              '<span style="font-size:13px" id="hcc-analytics-toggle-label">Off</span>' +
            '</label>' +
          '</div>' +
          '<p style="color:rgba(245,242,238,0.7);font-size:13px;margin:0">' +
            'Google Analytics, Microsoft Clarity, and Facebook Pixel. ' +
            'Help us understand how people use the site and reach potential new members.' +
          '</p>' +
        '</div>' +

        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button id="hcc-prefs-cancel" style="' +
            'background:transparent;color:#f5f2ee;border:1px solid rgba(245,242,238,0.4);' +
            'font-family:\'Barlow Condensed\',sans-serif;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
            'padding:8px 14px;border-radius:3px;cursor:pointer' +
          '">Cancel</button>' +
          '<button id="hcc-prefs-save" style="' +
            'background:#D0021B;color:#fff;border:1px solid #D0021B;' +
            'font-family:\'Barlow Condensed\',sans-serif;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
            'padding:8px 14px;border-radius:3px;cursor:pointer' +
          '">Save Preferences</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  function removeBanner() {
    var b = document.getElementById('hcc-consent-banner');
    if (b) b.parentNode.removeChild(b);
  }

  function removePrefsModal() {
    var m = document.getElementById('hcc-consent-prefs-modal');
    if (m) m.parentNode.removeChild(m);
  }

  function showPrefsModal(currentAnalytics) {
    removeBanner();
    document.body.insertAdjacentHTML('beforeend', PREFS_HTML);
    var toggle = document.getElementById('hcc-analytics-toggle');
    var label  = document.getElementById('hcc-analytics-toggle-label');
    toggle.checked = !!currentAnalytics;
    label.textContent = toggle.checked ? 'On' : 'Off';
    toggle.addEventListener('change', function () {
      label.textContent = this.checked ? 'On' : 'Off';
    });
    document.getElementById('hcc-prefs-cancel').addEventListener('click', function () {
      removePrefsModal();
      // Re-show banner only if no decision has been saved yet
      if (!getStored()) showBanner();
    });
    document.getElementById('hcc-prefs-save').addEventListener('click', function () {
      var analytics = document.getElementById('hcc-analytics-toggle').checked;
      saveConsent(analytics);
      removePrefsModal();
      if (analytics) activateAnalytics();
    });
  }

  function showBanner() {
    document.body.insertAdjacentHTML('beforeend', BANNER_HTML);
    document.getElementById('hcc-consent-accept').addEventListener('click', function () {
      saveConsent(true);
      removeBanner();
      activateAnalytics();
    });
    document.getElementById('hcc-consent-reject').addEventListener('click', function () {
      saveConsent(false);
      removeBanner();
    });
    document.getElementById('hcc-consent-prefs').addEventListener('click', function () {
      showPrefsModal(false);
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  var stored = getStored();

  if (stored) {
    // Consent already given — honour it immediately (no banner)
    if (stored.analytics) activateAnalytics();
  } else {
    // No decision yet — show banner once DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }

  // ── Public API (for re-opening prefs from a footer link) ────────────────────
  window.HCCConsent = {
    showPreferences: function () {
      var stored = getStored();
      showPrefsModal(stored ? stored.analytics : false);
    },
    hasConsented: function () {
      var s = getStored();
      return s ? s.analytics : null;
    },
  };

})();
