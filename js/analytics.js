/**
 * js/analytics.js — Holmfirth CC
 *
 * Thin wrapper around GA4 gtag() for goal tracking.
 * consent.js is responsible for loading gtag() — this module only fires
 * events if gtag is already present (i.e. consent was granted).
 *
 * Goals:
 *   trial_ride_cta_click        — user clicks "Join a Free Trial Ride" CTA
 *   trial_ride_signup_start     — user opens the trial signup form in a ride modal
 *   trial_ride_signup_complete  — trial signup API call succeeds
 *   join_wizard_open            — user opens the membership join wizard
 *   join_wizard_step1_complete  — user successfully submits personal details (pre-DD)
 *   membership_signup_complete  — GoCardless mandate authorised (payment committed)
 */

export function trackEvent(eventName, params) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, params || {});
}
