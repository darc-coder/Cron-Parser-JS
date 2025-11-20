#!/usr/bin/env node
/*

Usage:
  node cron-parser.file "*/15 0 1,15 * 1-5 /usr/bin/find"
*/

const FIELD_DEFS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 6 },
];

const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const DOW_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function padLeftRight(s, width = 14) {
  s = String(s);
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

function uniqueSorted(arr) {
  const s = Array.from(new Set(arr));
  s.sort((a,b) => a - b);
  return s;
}

function replaceNames(token, fieldIndex) {
  // Replace month/day names with numeric equivalents inside the token
  // e.g., "jan-mar" -> "1-3" or "mon-fri" -> "1-5"
  const nameMap = fieldIndex === 3 ? MONTH_NAMES : (fieldIndex === 4 ? DOW_NAMES : null);
  if (!nameMap) return token;
  return token.replace(/[a-zA-Z]{3}/g, (m) => {
    const key = m.toLowerCase();
    if (nameMap[key] !== undefined) return String(nameMap[key]);
    return m;
  });
}

function parseToken(token, min, max, fieldIndex) {
  token = token.trim();
  token = replaceNames(token, fieldIndex);

  // handle step
  const [rangePart, stepPart] = token.split('/');
  const step = stepPart ? parseInt(stepPart, 10) : 1;
  if (isNaN(step) || step <= 0) throw new Error(`Invalid step in token '${token}'`);

  let rangeStart, rangeEnd;
  if (rangePart === '*') {
    rangeStart = min;
    rangeEnd = max;
  } else if (rangePart.includes('-')) {
    const [a, b] = rangePart.split('-').map(x => parseInt(x, 10));
    if (isNaN(a) || isNaN(b)) throw new Error(`Invalid range in token '${token}'`);
    rangeStart = a;
    rangeEnd = b;
  } else {
    // single number
    const val = parseInt(rangePart, 10);
    if (isNaN(val)) throw new Error(`Invalid value '${rangePart}' in token '${token}'`);
    rangeStart = val;
    rangeEnd = val;
  }

  // Special handling: if field is day-of-week and user specified 7, treat it as 0 (Sun)
  if (fieldIndex === 4) {
    if (rangeStart === 7) rangeStart = 0;
    if (rangeEnd === 7) rangeEnd = 0;
  }

  // Validate bounds. For ranges where start > end, treat as error
  if (rangeStart < min || rangeStart > max || rangeEnd < min || rangeEnd > max) {
    // Allow the special case where day-of-week end was 0 (from 7 -> 0) and min is 0
    // But otherwise throw
    throw new Error(`Value out of bounds in token '${token}' (allowed ${min}-${max})`);
  }

  const out = [];
  for (let v = rangeStart; v <= rangeEnd; v += step) {
    out.push(v);
  }
  return out;
}

function parseField(fieldStr, defIndex) {
  const def = FIELD_DEFS[defIndex];
  if (!fieldStr) throw new Error('Missing field');
  const parts = fieldStr.split(',').map(p => p.trim()).filter(p => p.length > 0);
  let values = [];
  for (const p of parts) {
    values = values.concat(parseToken(p, def.min, def.max, defIndex));
  }
  return uniqueSorted(values);
}

function formatOutput(expanded, command) {
  const lines = [];
  for (let i = 0; i < FIELD_DEFS.length; i++) {
    const name = FIELD_DEFS[i].name;
    const arr = expanded[i].map(x => String(x));
    lines.push(padLeftRight(name, 14) + arr.join(' '));
  }
  lines.push(padLeftRight('command', 14) + command);
  return lines.join('\n');
}

function main() {
  const raw = process.argv.slice(2).join(' ').trim();
  if (!raw) {
    console.error('Usage: node cron-parser.js "<cron expression>"');
    console.error('Example: node cron-parser.js "*/15 0 1,15 * 1-5 /usr/bin/find"');
    process.exit(1);
  }

  // split into 6 parts: 5 fields + command. Command may contain spaces so split first 5
  const parts = raw.split(/\s+/);
  if (parts.length < 6) {
    console.error('Invalid cron expression: expected at least 6 space-separated parts (5 time fields + command)');
    process.exit(2);
  }

  const timeFields = parts.slice(0,5);
  const command = parts.slice(5).join(' ');

  try {
    const expanded = timeFields.map((f, i) => parseField(f, i));
    console.log(formatOutput(expanded, command));
  } catch (err) {
    console.error('Error parsing cron expression:', err.message);
    process.exit(3);
  }
}

if (require.main === module) main();
