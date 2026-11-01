import { dedupe } from './text.mjs';

/**
 * Azure Local release "trains" look like 2411, 2411.3, 2503 ... 2610.
 * Solution versions look like 10.2411.3.2 (23H2), 11.2510.1002.93 / 12.2610.1004.41 (24H2).
 */

const YYMM = '(?:2[3-9])(?:0[1-9]|1[0-2])';
const SOLUTION_RE = new RegExp(`\\b(1[0-2])\\.(${YYMM})\\.(\\d+)\\.(\\d+)\\b`, 'g');
const TRAIN_RE = new RegExp(`(?<![\\d.])(${YYMM})(?:\\.(\\d{1,2}))?(?!\\.?\\d)`, 'g');
const OS_RE = /\b(2[34])H2\b/gi;

export function trainFromSolutionVersion(version) {
  const m = new RegExp(`^(1[0-2])\\.(${YYMM})\\.(\\d+)\\.(\\d+)$`).exec(String(version ?? '').trim());
  if (!m) return null;
  const [, major, yymm, minor] = m;
  if (major === '10' && Number(minor) > 0) return `${yymm}.${Number(minor)}`;
  return yymm;
}

/** 10.x and 11.x solution versions ship the 25398 (23H2) OS build; 12.x ships 26100 (24H2). */
export function osVersionFromSolutionVersion(version) {
  const m = /^(\d+)\./.exec(String(version ?? ''));
  if (!m) return null;
  return m[1] === '12' ? '24H2' : '23H2';
}

/** Numeric sort key: 2411.3 -> 241103 */
export function trainKey(train) {
  const m = /^(\d{4})(?:\.(\d+))?$/.exec(String(train));
  if (!m) return -1;
  return Number(m[1]) * 100 + Number(m[2] ?? 0);
}

export const compareTrains = (a, b) => trainKey(a) - trainKey(b);

/** "2411.0" -> "2411" */
export function normalizeTrain(train) {
  const m = /^(\d{4})(?:\.(\d+))?$/.exec(String(train).trim());
  if (!m) return null;
  return Number(m[2] ?? 0) > 0 ? `${m[1]}.${Number(m[2])}` : m[1];
}

/**
 * Pull version hints out of a short string (title, file name).
 * Returns { solutionVersions, trains, osVersions, openEnded, range }.
 */
export function extractVersions(text) {
  const src = String(text ?? '');
  const solutionVersions = [];
  for (const m of src.matchAll(SOLUTION_RE)) solutionVersions.push(m[0]);

  // Remove solution versions so their middle segment is not re-read as a train;
  // file names use hyphens for dots (2411-1).
  const rest = src.replace(SOLUTION_RE, ' ').replace(/(\d{4})-(\d)(?!\d)/g, '$1.$2');

  const trains = [];
  for (const m of rest.matchAll(TRAIN_RE)) {
    const t = normalizeTrain(m[2] ? `${m[1]}.${m[2]}` : m[1]);
    if (t) trains.push(t);
  }
  for (const v of solutionVersions) {
    const t = trainFromSolutionVersion(v);
    if (t) trains.push(t);
  }

  const osVersions = [];
  for (const m of src.matchAll(OS_RE)) osVersions.push(`${m[1]}H2`.toUpperCase());

  const openEnded = /\b(and (later|newer|above)|or (later|newer|above)|onwards?)\b|\d\s*\+(?!\w)/i.test(rest);

  let range = null;
  const rm = new RegExp(`\\b(${YYMM}(?:\\.\\d+)?)\\s*(?:-|–|—|to|through|thru)\\s*(${YYMM}(?:\\.\\d+)?)\\b`, 'i').exec(rest);
  if (rm) range = { from: normalizeTrain(rm[1]), to: normalizeTrain(rm[2]) };

  return {
    solutionVersions: dedupe(solutionVersions),
    trains: dedupe(trains),
    osVersions: dedupe(osVersions),
    openEnded,
    range,
  };
}

/**
 * Expand a from/to range (either nullable = open) into the known trains it covers.
 * @param {string[]} knownTrains
 */
export function expandRange(from, to, knownTrains) {
  const lo = from ? trainKey(from) : -Infinity;
  const hi = to ? trainKey(to) : Infinity;
  return knownTrains.filter((t) => trainKey(t) >= lo && trainKey(t) <= hi);
}

/** Map an arbitrary train to a known one: exact match, else its base train (2411.0 -> 2411). */
export function resolveKnownTrain(train, knownSet) {
  const t = normalizeTrain(train);
  if (!t) return null;
  if (knownSet.has(t)) return t;
  const base = t.split('.')[0];
  if (knownSet.has(base)) return base;
  return null;
}
