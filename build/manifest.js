// Pure manifest parsing, validation, and formatting.
//
// These functions never touch the filesystem so they can be unit-tested in
// isolation. The loader (build/index.js) is responsible for reading gallery.yaml
// with the FAILSAFE schema (so every scalar arrives here as a string) and for
// confirming that referenced image files exist on disk.

const DATE_RE = /^(\d{4})(?:-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?)?$/;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Validate and normalize a single raw entry. `i` is the zero-based position,
// used only to make error messages point at the offending entry.
export function parseEntry(entry, i) {
  const where = `gallery.yaml entry ${i + 1}`;

  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    const got = Array.isArray(entry) ? 'a list' : `a ${entry === null ? 'null' : typeof entry}`;
    throw new Error(`${where}: expected a mapping (file/title/date), got ${got}`);
  }

  const required = { file: entry.file, title: entry.title, date: entry.date };
  for (const [key, value] of Object.entries(required)) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${where}: missing or empty required field "${key}"`);
    }
  }

  const { attribution } = entry;
  if (attribution !== undefined && attribution !== null && typeof attribution !== 'string') {
    throw new Error(`${where} ("${entry.title}"): "attribution" must be a single string if present`);
  }

  const date = entry.date.trim();
  if (!DATE_RE.test(date)) {
    throw new Error(
      `${where} ("${entry.title}"): date "${entry.date}" must be YYYY, YYYY-MM, or YYYY-MM-DD`,
    );
  }

  const attr = typeof attribution === 'string' ? attribution.trim() : '';

  return {
    file: entry.file.trim(),
    title: entry.title.trim(),
    date,
    attribution: attr === '' ? null : attr,
  };
}

// Validate a whole manifest (an array of raw entries) and return normalized
// entries in the same order.
export function parseManifest(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('gallery.yaml: top level must be a list of image entries');
  }
  if (entries.length === 0) {
    throw new Error('gallery.yaml: no entries found (the list is empty)');
  }
  return entries.map((entry, i) => parseEntry(entry, i));
}

// Turn a validated ISO-ish date into a display string:
//   2026            -> "2026"
//   2026-03         -> "March 2026"
//   2026-03-14      -> "March 14, 2026"
export function formatDate(date) {
  const match = DATE_RE.exec(date);
  if (!match) return date;
  const [, year, month, day] = match;
  const monthName = month ? MONTHS[Number(month) - 1] : null;
  if (day) return `${monthName} ${Number(day)}, ${year}`;
  if (monthName) return `${monthName} ${year}`;
  return year;
}
