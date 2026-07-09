// Timezone-safe date & week helpers for the habit tracker domain core.
//
// Weeks run Sunday–Saturday (SPEC-locked). Every function operates on ISO date
// strings ("YYYY-MM-DD") and parses them COMPONENT-WISE — never via
// `new Date("YYYY-MM-DD")`, which the spec forbids because that parses as UTC
// midnight and silently shifts the calendar day in negative-offset timezones.
//
// Internally dates are converted to an integer "serial day" (days since the
// Unix epoch, 1970-01-01) using Howard Hinnant's proleptic-Gregorian
// algorithms. Integer arithmetic is fully deterministic and DST-proof, so the
// same results hold under `node --test` and in the browser.

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Parse an ISO date string into [year, month, day] integers.
 * @param {string} iso e.g. "2026-07-11"
 * @returns {[number, number, number]}
 */
function parseIso(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) {
    throw new RangeError(`invalid ISO date: ${iso}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Zero-pad a positive integer to two digits. */
function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Days since 1970-01-01 for a civil (Gregorian) date. Hinnant's days_from_civil.
 * @param {number} y @param {number} m @param {number} d
 * @returns {number}
 */
function daysFromCivil(y, m, d) {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Civil (Gregorian) date [y, m, d] for a serial day count. Hinnant's
 * civil_from_days — the exact inverse of {@link daysFromCivil}.
 * @param {number} z days since 1970-01-01
 * @returns {[number, number, number]}
 */
function civilFromDays(z) {
  const zz = z + 719468;
  const era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [m <= 2 ? y + 1 : y, m, d];
}

/**
 * Serial day count (days since 1970-01-01) for an ISO date string.
 * @param {string} iso
 * @returns {number}
 */
export function serialOf(iso) {
  const [y, m, d] = parseIso(iso);
  return daysFromCivil(y, m, d);
}

/**
 * Weekday index 0..6 (0 = Sunday) for a serial day. 1970-01-01 (serial 0) was a
 * Thursday (index 4). Guarded against negative modulo for pre-epoch inputs.
 * @param {number} z
 * @returns {number}
 */
function weekdayIndex(z) {
  return (((z % 7) + 4) % 7 + 7) % 7;
}

/**
 * Day-of-week name ("sun".."sat") for an ISO date.
 * @param {string} iso
 * @returns {"sun"|"mon"|"tue"|"wed"|"thu"|"fri"|"sat"}
 */
export function dayOfWeek(iso) {
  return DAY_NAMES[weekdayIndex(serialOf(iso))];
}

/**
 * Add (or subtract, with a negative `n`) whole days to an ISO date.
 * @param {string} iso
 * @param {number} n
 * @returns {string} the resulting ISO date
 */
export function addDays(iso, n) {
  const [y, m, d] = civilFromDays(serialOf(iso) + n);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * The Sunday that starts the given date's week (weeks run Sun–Sat).
 * @param {string} iso
 * @returns {string}
 */
export function weekStart(iso) {
  const z = serialOf(iso);
  return addDays(iso, -weekdayIndex(z));
}

/**
 * Whole weeks elapsed between the anchor's week and the given date's week.
 * Both endpoints are normalised to their Sunday, so the result is exact (and
 * negative for dates before the anchor). This integer defines the parity phase.
 * @param {string} iso
 * @param {string} anchorIso the `anchor_date` from config
 * @returns {number}
 */
export function weekIndex(iso, anchorIso) {
  const anchorSunday = serialOf(weekStart(anchorIso));
  const dateSunday = serialOf(weekStart(iso));
  return Math.round((dateSunday - anchorSunday) / 7);
}

/**
 * Week parity relative to the anchor: "even" for an even {@link weekIndex},
 * "odd" otherwise. Negative indices are handled without sign errors.
 * @param {string} iso
 * @param {string} anchorIso
 * @returns {"even"|"odd"}
 */
export function weekParity(iso, anchorIso) {
  const idx = weekIndex(iso, anchorIso);
  return (((idx % 2) + 2) % 2) === 0 ? "even" : "odd";
}
