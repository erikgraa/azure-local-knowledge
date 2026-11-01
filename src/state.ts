import type { ItemType, State, ViewMode } from './types';

const TYPES: ItemType[] = ['tsg', 'known-issue', 'release'];
const STATUSES = ['open', 'fixed', 'expected'] as const;

export const defaultState = (): State => ({
  q: '',
  view: 'search',
  release: null,
  only: false,
  types: [],
  areas: [],
  statuses: [],
  sort: 'relevance',
  id: null,
});

const list = (v: string | null): string[] => (v ? v.split('~').map(decodeURIComponent).filter(Boolean) : []);

/** Everything shareable lives in the query string: ?q=...&v=2506&view=version&type=tsg&area=...&id=... */
export function parseState(search: string): State {
  const p = new URLSearchParams(search);
  const s = defaultState();
  s.q = (p.get('q') ?? '').slice(0, 2000);
  s.view = (p.get('view') === 'version' ? 'version' : 'search') as ViewMode;
  s.release = p.get('v') || null;
  s.only = p.get('only') === '1';
  s.types = list(p.get('type')).filter((t): t is ItemType => TYPES.includes(t as ItemType));
  s.areas = list(p.get('area'));
  s.statuses = list(p.get('status')).filter((t): t is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(t));
  s.sort = p.get('sort') === 'updated' ? 'updated' : 'relevance';
  s.id = p.get('id') || null;
  return s;
}

const join = (xs: string[]) => xs.map(encodeURIComponent).join('~');

export function serializeState(s: State): string {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.view !== 'search') p.set('view', s.view);
  if (s.release) p.set('v', s.release);
  if (s.release && s.only) p.set('only', '1');
  if (s.types.length) p.set('type', join(s.types));
  if (s.areas.length) p.set('area', join(s.areas));
  if (s.statuses.length) p.set('status', join(s.statuses));
  if (s.sort !== 'relevance') p.set('sort', s.sort);
  if (s.id) p.set('id', s.id);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}
