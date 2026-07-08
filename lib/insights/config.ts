// Insights Engine config knobs.

// Gating: the user chose to ship to ALL users immediately (overriding the spec's
// admin-only 2-week validation step). Flip to false to gate the Home card +
// /insights surfaces on isAdmin if money-stress messaging needs vetting first.
// The nightly build job runs for everyone regardless — this only controls what
// is SHOWN. (See the plan's "Gating note".)
export const INSIGHTS_ALL_USERS = true;

// Frequency governor: across surfaces, at most this many NEW insights surface per
// day (severity-3 exempt). "Trust dies by a thousand nudges."
export const MAX_NEW_PER_DAY = 3;

// Default liquid-cash buffer as a multiple of monthly outflow (idle-cash target).
export const DEFAULT_BUFFER_MULTIPLE = 1.5;
