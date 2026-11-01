import './styles.css';
import { ICONS, STATUS_LABEL, TYPE_SHORT, esc, fmtDate, plural } from './format';
import { type CardContext, renderCard, renderDrawer } from './render';
import { Searcher, highlightTerms } from './search';
import { defaultState, parseState, serializeState } from './state';
import type { Affects, IndexData, Item, ItemType, Release, State } from './types';
import { affects, compareTrainsDesc, releaseLabel, trainKey } from './versions';

const PAGE = 30;
const GROUP_PREVIEW = 10;
const EXAMPLES = ['SecretNotFoundException', 'Arc registration error 42', 'OperationTimeout', 'Test-Cluster DNS failure', '0x800706BA'];
const STATUSES = ['open', 'fixed', 'expected'] as const;

interface Row {
  item: Item;
  score: number;
  affects: Affects | null;
}

let data: IndexData;
let searcher: Searcher;
let byId = new Map<string, Item>();
let releaseById = new Map<string, Release>();
let allTrainsAsc: string[] = [];
let state: State = defaultState();
let shown = PAGE;
const expanded = new Set<string>();
let drawerPushed = false;
let lastFocus: HTMLElement | null = null;

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

// ---------------------------------------------------------------- theme
function initTheme() {
  const forced = new URLSearchParams(location.search).get('theme');
  const saved = localStorage.getItem('azl-theme');
  const theme = forced === 'light' || forced === 'dark' ? forced : (saved ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  document.documentElement.dataset.theme = theme;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('azl-theme', next);
  paintThemeButton();
}

function paintThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const btn = document.getElementById('theme');
  if (btn) {
    btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

// ---------------------------------------------------------------- shell
function shell() {
  $('#app').innerHTML = `
  <header class="topbar">
    <a class="brand" href="${esc(location.pathname)}" aria-label="Azure Local Compendium home">
      <span class="logo" aria-hidden="true"><img src="${import.meta.env.BASE_URL}favicon.svg" alt="" width="36" height="36" /></span>
      <span class="brand-text"><strong>Azure Local Compendium</strong><span class="muted small">Troubleshooting guides &amp; known issues</span></span>
    </a>
    <div class="top-actions">
      <button type="button" class="icon-btn only-narrow" id="toggle-filters" aria-label="Filters" title="Filters">${ICONS.filter}</button>
      <button type="button" class="icon-btn" id="theme"></button>
    </div>
  </header>

  <section class="hero">
    <div class="hero-inner">
      <h1>Let's get your <span class="grad">Azure Local</span> back on track</h1>
      <p class="muted">Paste an error message, exception or symptom and we'll look through the Supportability guides and release known&nbsp;issues for you.</p>
      <div class="searchbox">
        <span class="search-icon">${ICONS.search}</span>
        <textarea id="q" rows="1" placeholder="Paste an error, e.g. SecretNotFoundException, or describe the problem…" aria-label="Search troubleshooting guides and known issues" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
        <button type="button" class="icon-btn" id="clear" aria-label="Clear search" hidden>${ICONS.close}</button>
      </div>
      <div class="release-row" id="release-row"></div>
      <div class="examples" id="examples"><span class="muted small">Try</span>${EXAMPLES.map((e) => `<button type="button" class="chip" data-search="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      <p class="hints muted small only-wide"><kbd>/</kbd> search · <kbd>↓</kbd> <kbd>↑</kbd> browse results · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</p>
    </div>
  </section>

  <div id="notice"></div>

  <div class="layout">
    <aside class="filters" id="filters" aria-label="Filters"></aside>
    <main id="results" aria-live="polite"></main>
  </div>

  <footer class="footer muted small" id="footer"></footer>
  <div class="scrim" id="scrim" hidden></div>
  <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden></aside>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  paintThemeButton();
}

// ---------------------------------------------------------------- data + compute
async function loadData(): Promise<IndexData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/index.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as IndexData;
}

const itemPasses = (item: Item, skip?: 'type' | 'area' | 'status'): boolean => {
  if (skip !== 'type' && state.types.length && !state.types.includes(item.type)) return false;
  if (skip !== 'area' && state.areas.length && !(item.area && state.areas.includes(item.area))) return false;
  if (skip !== 'status' && state.statuses.length && item.type === 'known-issue' && !(item.status && state.statuses.includes(item.status))) return false;
  return true;
};

function baseRows(): Row[] {
  const q = state.q.trim();
  const release = state.release ? (releaseById.get(state.release) ?? null) : null;
  // "Fixed in a newer release" is limited to the next two release trains.
  const laterWindow = release ? allTrainsAsc.filter((t) => trainKey(t) > trainKey(release.id)).slice(0, 2) : [];
  const hits = q
    ? searcher.search(q).map((h) => ({ item: h.item, score: h.score }))
    : data.items
        .filter((i) => i.type !== 'release' || state.types.includes('release') || (state.release !== null && i.releases.includes(state.release)))
        .map((item) => ({ item, score: 0 }));
  const rows: Row[] = hits.map((h) => ({ ...h, affects: release ? affects(h.item, release, laterWindow) : null }));
  return rows;
}

function sortRows(rows: Row[]): Row[] {
  const hasQuery = Boolean(state.q.trim());
  const updated = (r: Row) => r.item.lastUpdated ?? '';
  return [...rows].sort((a, b) => {
    if (state.sort === 'updated' || !hasQuery) {
      const d = updated(b).localeCompare(updated(a));
      if (d) return d;
      return b.score - a.score;
    }
    const bump = (r: Row) => (r.affects === 'yes' ? 1.12 : r.affects === 'no' ? 0.85 : 1);
    return b.score * bump(b) - a.score * bump(a);
  });
}

function facetCounts(rows: Row[]) {
  const types = new Map<string, number>();
  const areas = new Map<string, number>();
  const statuses = new Map<string, number>();
  for (const r of rows) {
    if (itemPasses(r.item, 'type')) types.set(r.item.type, (types.get(r.item.type) ?? 0) + 1);
    if (itemPasses(r.item, 'area') && r.item.area) areas.set(r.item.area, (areas.get(r.item.area) ?? 0) + 1);
    if (r.item.type === 'known-issue' && itemPasses(r.item, 'status') && r.item.status) statuses.set(r.item.status, (statuses.get(r.item.status) ?? 0) + 1);
  }
  return { types, areas, statuses };
}

// ---------------------------------------------------------------- rendering
function releaseOptions(selected: string | null): string {
  const supported = data.releases.filter((r) => r.supported);
  const older = data.releases.filter((r) => !r.supported);
  const opt = (r: Release) => `<option value="${esc(r.id)}"${selected === r.id ? ' selected' : ''}>${esc(releaseLabel(r))}${r.osVersions.length ? ` (${esc(r.osVersions.join('/'))})` : ''}</option>`;
  return `<option value="">Any release</option>
    <optgroup label="Supported">${supported.map(opt).join('')}</optgroup>
    <optgroup label="Older / unsupported">${older.map(opt).join('')}</optgroup>`;
}

function renderFilters(rows: Row[]) {
  const shownCount = rows.filter((r) => itemPasses(r.item)).length;
  const { types, areas, statuses } = facetCounts(rows);
  const typeRow = (t: ItemType) =>
    `<label class="check"><input type="checkbox" data-filter="type" value="${t}"${state.types.includes(t) ? ' checked' : ''}><span>${esc(t === 'tsg' ? 'Troubleshooting guides' : t === 'known-issue' ? 'Known issues' : 'Releases')}</span><em>${types.get(t) ?? 0}</em></label>`;
  const statusRow = (s: (typeof STATUSES)[number]) =>
    `<label class="check"><input type="checkbox" data-filter="status" value="${s}"${state.statuses.includes(s) ? ' checked' : ''}><span>${esc(STATUS_LABEL[s])}</span><em>${statuses.get(s) ?? 0}</em></label>`;
  const areaList = [...new Set([...areas.keys(), ...state.areas])].sort((a, b) => (areas.get(b) ?? 0) - (areas.get(a) ?? 0) || a.localeCompare(b));
  const active = state.types.length + state.areas.length + state.statuses.length + (state.release ? 1 : 0);

  $('#filters').innerHTML = `
    <div class="filter-head"><h2>Filters</h2>${active ? `<button type="button" class="link-btn" data-reset>Reset (${active})</button>` : ''}<button type="button" class="icon-btn only-narrow" data-close-filters aria-label="Close filters">${ICONS.close}</button></div>
    <div class="fgroup"><div class="flabel">Type</div>${(['tsg', 'known-issue', 'release'] as ItemType[]).map(typeRow).join('')}</div>
    <div class="fgroup"><div class="flabel">Known-issue status</div>${STATUSES.map(statusRow).join('')}</div>
    <div class="fgroup"><div class="flabel">Area</div><div class="area-list">${areaList.map((a) => `<label class="check"><input type="checkbox" data-filter="area" value="${esc(a)}"${state.areas.includes(a) ? ' checked' : ''}><span>${esc(a)}</span><em>${areas.get(a) ?? 0}</em></label>`).join('') || '<p class="muted small">No areas</p>'}</div></div>
    <div class="fgroup">
      <label class="flabel" for="sort">Sort</label>
      <select id="sort"><option value="relevance"${state.sort === 'relevance' ? ' selected' : ''}>Best match</option><option value="updated"${state.sort === 'updated' ? ' selected' : ''}>Recently updated</option></select>
    </div>
    <div class="filter-apply only-narrow"><button type="button" class="btn primary" data-close-filters>Show ${plural(shownCount, 'result')}</button></div>`;
}

function activeChips(): string {
  const chips: string[] = [];
  if (state.release) chips.push(`<button type="button" class="chip removable" data-remove="release">Release ${esc(state.release)}${ICONS.close}</button>`);
  for (const t of state.types) chips.push(`<button type="button" class="chip removable" data-remove="type" data-value="${t}">${esc(TYPE_SHORT[t])}${ICONS.close}</button>`);
  for (const s of state.statuses) chips.push(`<button type="button" class="chip removable" data-remove="status" data-value="${s}">${esc(STATUS_LABEL[s])}${ICONS.close}</button>`);
  for (const a of state.areas) chips.push(`<button type="button" class="chip removable" data-remove="area" data-value="${esc(a)}">${esc(a)}${ICONS.close}</button>`);
  return chips.length ? `<div class="chips active-chips">${chips.join('')}</div>` : '';
}

function cardFor(row: Row, release: Release | null, terms: string[]): string {
  const ctx: CardContext = { terms, affects: row.affects, release, allTrainsAsc };
  return renderCard(row.item, ctx);
}

/** Rows for the selected release: items documented only for other releases are hidden unless asked for. */
function releaseScoped(rows: Row[]): { rows: Row[]; hidden: number } {
  if (!state.release || state.others) return { rows, hidden: 0 };
  const kept = rows.filter((r) => r.affects !== 'no');
  return { rows: kept, hidden: rows.filter((r) => r.affects === 'no' && itemPasses(r.item)).length };
}

/** One line under the results: how many matches are hidden because they belong to other releases. */
function othersHint(hidden: number): string {
  if (!state.release || !state.q.trim()) return '';
  if (state.others) {
    return `<p class="muted small others-hint">Including items documented for other releases. <button type="button" class="link-btn" data-others="0">Show only ${esc(state.release)}</button></p>`;
  }
  if (!hidden) return '';
  return `<p class="muted small others-hint">${plural(hidden, 'more match', 'more matches')} documented only for other releases. <button type="button" class="link-btn" data-others="1">Show ${hidden === 1 ? 'it' : 'them'}</button></p>`;
}

function renderFlat(rows: Row[], terms: string[], release: Release | null, hidden = 0): string {
  const filtered = sortRows(rows.filter((r) => itemPasses(r.item)));
  const visible = filtered.slice(0, shown);
  const q = state.q.trim();
  const heading = q
    ? `${plural(filtered.length, 'result')} for <strong>“${esc(q.length > 80 ? `${q.slice(0, 80)}…` : q)}”</strong>${release ? ` on <strong>${esc(release.id)}</strong>` : ''}`
    : `${plural(filtered.length, 'item')} · newest first`;
  return `<div class="results-head"><p class="count-line">${heading}</p>${activeChips()}</div>
    ${visible.length ? `<div class="cards">${visible.map((r) => cardFor(r, release, terms)).join('')}</div>` : emptyState(release ? hidden : 0)}
    ${filtered.length > visible.length ? `<div class="more"><button type="button" class="btn" data-more>Show ${Math.min(PAGE, filtered.length - visible.length)} more <span class="muted">(${filtered.length - visible.length} left)</span></button></div>` : ''}
    ${othersHint(hidden)}`;
}

/** Overview of one release (no search text): what is listed for it, grouped by how it relates. */
function renderReleaseOverview(rows: Row[], terms: string[], release: Release, hidden = 0): string {
  const filtered = rows.filter((r) => itemPasses(r.item));
  const sorted = sortRows(filtered);
  const groups: { key: string; title: string; hint?: string; rows: Row[]; collapsed?: boolean }[] = [
    { key: 'release', title: `About ${release.id}`, rows: sorted.filter((r) => r.affects === 'yes' && r.item.type === 'release') },
    { key: 'ki', title: `Known issues listed for ${release.id}`, hint: 'Straight from the Learn release notes for this release (including issues carried over from earlier ones).', rows: sorted.filter((r) => r.affects === 'yes' && r.item.type === 'known-issue') },
    { key: 'tsg', title: `Troubleshooting guides for ${release.id}`, hint: 'Guides whose title or body names this release.', rows: sorted.filter((r) => r.affects === 'yes' && r.item.type === 'tsg') },
    { key: 'fixed', title: 'Fixed in an upcoming release', hint: `Known issues resolved in the next releases after ${release.id}; updating is the fix.`, rows: sorted.filter((r) => r.affects === 'fixed-later') },
    { key: 'maybe', title: 'Guides without a stated release', hint: `These guides don’t name a release, so they may apply to ${release.id}.`, rows: sorted.filter((r) => r.affects === 'maybe'), collapsed: true },
    { key: 'other', title: `Documented for other releases`, hint: `Shown because you asked for them. These aren’t listed for ${release.id}: check the affected releases before acting.`, rows: sorted.filter((r) => r.affects === 'no'), collapsed: true },
  ].filter((g) => g.rows.length);

  const header = `<section class="panel banner">
    <div><h2>${esc(releaseLabel(release))}</h2><p class="muted small">${[release.osVersions.join(' / '), release.solutionVersions[0]?.version ? `solution ${release.solutionVersions[0].version}` : '', release.availabilityDate ? `available ${fmtDate(release.availabilityDate)}` : '', release.supported ? 'supported' : 'outside the supported window'].filter(Boolean).map(esc).join(' · ')}</p></div>
  </section>`;

  if (!groups.length) return `${header}${emptyState(hidden)}${othersHint(hidden)}`;

  // If nothing is specific to this release, don't hide the matches that do exist behind collapsed groups.
  const nothingSpecific = !groups.some((g) => !g.collapsed);
  const notice =
    nothingSpecific && state.q.trim() && !state.others
      ? `<p class="callout info">Nothing is documented specifically for <strong>${esc(release.id)}</strong> for this search. These guides don’t name a release, so they may still apply.</p>`
      : '';

  const body = groups
    .map((g) => {
      const open = expanded.has(g.key);
      const visible = open ? g.rows : g.rows.slice(0, GROUP_PREVIEW);
      return `<section class="group">
        <details${g.collapsed && !nothingSpecific ? '' : ' open'}>
          <summary><h3>${esc(g.title)} <span class="count">${g.rows.length}</span></h3></summary>
          ${g.hint ? `<p class="muted small group-hint">${esc(g.hint)}</p>` : ''}
          <div class="cards">${visible.map((r) => cardFor(r, release, terms)).join('')}</div>
          ${g.rows.length > visible.length ? `<button type="button" class="btn" data-expand="${g.key}">Show all ${g.rows.length}</button>` : ''}
        </details>
      </section>`;
    })
    .join('');
  return header + notice + body + othersHint(hidden);
}

function emptyState(otherReleaseMatches = 0): string {
  const rel = state.release;
  return `<section class="panel empty">
    <h2>No matches${rel ? ` for ${esc(rel)}` : ''}</h2>
    ${otherReleaseMatches && rel ? `<p class="muted">${plural(otherReleaseMatches, 'item')} match${otherReleaseMatches === 1 ? 'es' : ''} but ${otherReleaseMatches === 1 ? 'is' : 'are'} only documented for other releases. <button type="button" class="link-btn" data-others="1">Show ${otherReleaseMatches === 1 ? 'it' : 'them'}</button></p>` : ''}
    <p class="muted">Try fewer words, paste just the exception or error code, or clear some filters. Identifiers like <code>SecretNotFoundException</code> or <code>0x800706BA</code> work best.</p>
    <div class="chips">${EXAMPLES.map((e) => `<button type="button" class="chip" data-search="${esc(e)}">${esc(e)}</button>`).join('')}</div>
  </section>`;
}

function filterFocusKey(): string | null {
  const a = document.activeElement as HTMLElement | null;
  if (!a || !a.closest('#filters, #release-row')) return null;
  if (a.id) return `#${a.id}`;
  if (a instanceof HTMLInputElement && a.dataset.filter) return `#filters [data-filter="${a.dataset.filter}"][value="${CSS.escape(a.value)}"]`;
  return null;
}

/** The release picker under the search box: quick picks until a release is chosen, then a compact summary. */
function renderReleaseRow() {
  const quick = data.releases.filter((r) => r.supported).slice(0, 5);
  const chosen = state.release ? releaseById.get(state.release) : null;
  $('#release-row').innerHTML = `
    <label class="muted small" for="release">${chosen ? 'Showing results for' : 'Which release are you on?'}</label>
    <select id="release" data-release-select>${releaseOptions(state.release)}</select>
    ${chosen ? `<button type="button" class="chip removable" data-release-clear>${esc(chosen.id)}${ICONS.close}</button>` : quick.map((r) => `<button type="button" class="chip" data-release="${esc(r.id)}">${esc(r.id)}</button>`).join('')}`;
}

function update() {
  const all = baseRows();
  const { rows, hidden } = releaseScoped(all);
  const terms = highlightTerms(state.q);
  const release = state.release ? (releaseById.get(state.release) ?? null) : null;

  // Filters are re-rendered on every change; keep keyboard focus where the user was.
  const refocus = filterFocusKey();
  renderFilters(rows);
  renderReleaseRow();
  if (refocus) document.querySelector<HTMLElement>(refocus)?.focus({ preventScroll: true });
  ($('#clear') as HTMLButtonElement).hidden = !state.q;
  const box = $('#q') as HTMLTextAreaElement;
  if (box.value !== state.q) {
    box.value = state.q;
    autoGrow(box);
  }

  // A release with no search text gets the grouped overview; anything typed gets one ranked list.
  const html = release && !state.q.trim() ? renderReleaseOverview(rows, terms, release, hidden) : renderFlat(rows, terms, release, hidden);
  $('#results').innerHTML = html;

  const drawer = state.id ? byId.get(state.id) : null;
  if (drawer) showDrawer(drawer);
  else hideDrawer(false);
}

function renderFooter() {
  const counts = data.stats ?? {};
  $('#footer').innerHTML = `${plural(counts.tsg ?? 0, 'guide')} · ${plural(counts['known-issue'] ?? 0, 'known issue')} · ${plural(data.releases.length, 'release train')} · index built ${esc(fmtDate(data.generatedAt))}${data.enrichment ? ` · ${plural(data.enrichment.enrichedItems, 'item')} refined by Copilot` : ''}.
    Sources: ${data.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>`).join(' · ')}. Unofficial; always confirm in the linked source. <a href="https://github.com/erikgraa/azure-local-knowledge/blob/main/NOTICE.md" target="_blank" rel="noopener noreferrer">Notice &amp; licences</a>.`;
}

const SOURCE_LABEL: Record<string, string> = { tsg: 'the Supportability guides', learn: 'the Learn known issues and release information' };

/** Shown when the last update couldn't reach a source and re-used the previously published data for it. */
function renderNotice() {
  const el = $('#notice');
  const list = data.degraded ?? [];
  el.innerHTML = list.length
    ? `<div class="notice-bar" role="status">${ICONS.warn}<p><strong>Heads up:</strong> ${list
        .map((d) => `${esc(SOURCE_LABEL[d.source] ?? d.source)} could not be refreshed, so this site is showing the copy from ${esc(fmtDate(d.since))}`)
        .join('; ')}. Recent additions may be missing — check the linked sources for the latest.</p></div>`
    : '';
}

// ---------------------------------------------------------------- drawer
function showDrawer(item: Item) {
  const drawer = $('#drawer');
  const wasHidden = drawer.hidden;
  drawer.innerHTML = renderDrawer(item, data, byId, allTrainsAsc);
  drawer.hidden = false;
  $('#scrim').hidden = false;
  document.body.classList.add('drawer-open');
  document.title = `${item.title} · Azure Local Compendium`;
  if (wasHidden) {
    lastFocus = document.activeElement as HTMLElement | null;
    drawer.scrollTop = 0;
    drawer.querySelector<HTMLElement>('[data-close]')?.focus();
  }
}

function hideDrawer(restoreFocus = true) {
  const drawer = $('#drawer');
  if (drawer.hidden) return;
  drawer.hidden = true;
  $('#scrim').hidden = true;
  document.body.classList.remove('drawer-open');
  document.title = 'Azure Local Compendium — troubleshooting guides & known issues';
  if (restoreFocus) lastFocus?.focus?.();
}

// ---------------------------------------------------------------- state / url
function writeUrl(push: boolean) {
  const url = `${location.pathname}${serializeState(state)}`;
  if (push) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
}

function commit(patch: Partial<State>, opts: { push?: boolean; resetPaging?: boolean } = {}) {
  state = { ...state, ...patch };
  if (opts.resetPaging !== false) shown = PAGE;
  writeUrl(Boolean(opts.push));
  update();
}

function openItem(id: string) {
  if (!byId.has(id)) return;
  const alreadyOpen = Boolean(state.id);
  state = { ...state, id };
  document.body.classList.remove('filters-open');
  writeUrl(!alreadyOpen);
  if (!alreadyOpen) drawerPushed = true;
  update();
}

function closeItem() {
  if (!state.id) return;
  if (drawerPushed) {
    drawerPushed = false;
    history.back();
    return;
  }
  state = { ...state, id: null };
  writeUrl(false);
  update();
}

function toggle<T>(list: T[], value: T, on: boolean): T[] {
  const set = new Set(list);
  if (on) set.add(value);
  else set.delete(value);
  return [...set];
}

function toast(message: string) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 1800);
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
}

// ---------------------------------------------------------------- events
function bind() {
  const box = $('#q') as HTMLTextAreaElement;
  let timer: number | undefined;
  box.addEventListener('input', () => {
    autoGrow(box);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => commit({ q: box.value.replace(/\s+/g, ' ').trim().slice(0, 2000) }), 140);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) e.preventDefault();
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    const cards = () => [...document.querySelectorAll<HTMLElement>('#results .card')];
    const focusCard = (el: HTMLElement | undefined) => {
      if (!el) return;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest' });
    };

    // Keep Tab inside the open drawer (it is modal).
    if (e.key === 'Tab' && state.id) {
      const drawer = $('#drawer');
      const focusable = [...drawer.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!drawer.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      return;
    }

    if (e.key === '/' && !typing) {
      e.preventDefault();
      box.focus();
      box.select();
    } else if (e.key === 'Escape') {
      if (state.id) closeItem();
      else document.body.classList.remove('filters-open');
    } else if (!state.id && target === box && e.key === 'ArrowDown' && box.scrollHeight <= box.clientHeight + 4) {
      e.preventDefault();
      focusCard(cards()[0]);
    } else if (!state.id && target.classList.contains('card') && ['ArrowDown', 'ArrowUp', 'j', 'k', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const list = cards();
      const i = list.indexOf(target);
      if (e.key === 'Home') focusCard(list[0]);
      else if (e.key === 'End') focusCard(list[list.length - 1]);
      else if (e.key === 'ArrowDown' || e.key === 'j') focusCard(list[Math.min(i + 1, list.length - 1)]);
      else if (i <= 0) {
        box.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else focusCard(list[i - 1]);
    } else if ((e.key === 'Enter' || e.key === ' ') && target.classList.contains('card')) {
      e.preventDefault();
      openItem(target.dataset.open!);
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (el.matches('[data-release-select]')) {
      commit({ release: el.value || null, others: false });
    } else if (el.id === 'sort') {
      commit({ sort: el.value === 'updated' ? 'updated' : 'relevance' });
    } else if (el instanceof HTMLInputElement && el.dataset.filter) {
      const f = el.dataset.filter;
      if (f === 'type') commit({ types: toggle(state.types, el.value as ItemType, el.checked) });
      else if (f === 'status') commit({ statuses: toggle(state.statuses, el.value as (typeof STATUSES)[number], el.checked) });
      else if (f === 'area') commit({ areas: toggle(state.areas, el.value, el.checked) });
    }
  });

  document.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-search],[data-release],[data-release-clear],[data-others],[data-open],[data-close],[data-copy],[data-share],[data-more],[data-expand],[data-remove],[data-reset],[data-close-filters],#toggle-filters,#theme,#clear,#scrim');
    if (!t) return;
    if (t.tagName === 'A' || (e.target as HTMLElement).closest('a')) return;

    if (t.dataset.search !== undefined) {
      commit({ q: t.dataset.search });
      box.value = t.dataset.search;
      autoGrow(box);
      box.focus();
    } else if (t.dataset.release) {
      commit({ release: t.dataset.release, others: false });
    } else if (t.hasAttribute('data-release-clear')) {
      commit({ release: null, others: false });
    } else if (t.dataset.others !== undefined) {
      commit({ others: t.dataset.others === '1' });
    } else if (t.dataset.open) {
      openItem(t.dataset.open);
    } else if (t.hasAttribute('data-close') || t.id === 'scrim') {
      closeItem();
    } else if (t.dataset.copy !== undefined) {
      await navigator.clipboard?.writeText(t.dataset.copy).catch(() => {});
      toast('Copied to clipboard');
    } else if (t.hasAttribute('data-share')) {
      await navigator.clipboard?.writeText(location.href).catch(() => {});
      toast('Link copied');
    } else if (t.hasAttribute('data-more')) {
      shown += PAGE;
      update();
    } else if (t.dataset.expand) {
      expanded.add(t.dataset.expand);
      update();
    } else if (t.dataset.remove) {
      const v = t.dataset.value;
      if (t.dataset.remove === 'release') commit({ release: null, others: false });
      else if (t.dataset.remove === 'type') commit({ types: state.types.filter((x) => x !== v) });
      else if (t.dataset.remove === 'status') commit({ statuses: state.statuses.filter((x) => x !== v) });
      else if (t.dataset.remove === 'area') commit({ areas: state.areas.filter((x) => x !== v) });
    } else if (t.hasAttribute('data-reset')) {
      commit({ types: [], statuses: [], areas: [], release: null, others: false });
    } else if (t.id === 'toggle-filters') {
      document.body.classList.add('filters-open');
    } else if (t.hasAttribute('data-close-filters')) {
      document.body.classList.remove('filters-open');
    } else if (t.id === 'theme') {
      toggleTheme();
    } else if (t.id === 'clear') {
      commit({ q: '' });
      box.value = '';
      autoGrow(box);
      box.focus();
    }
  });

  window.addEventListener('popstate', () => {
    state = parseState(location.search);
    drawerPushed = false;
    shown = PAGE;
    update();
  });
}

// ---------------------------------------------------------------- boot
async function boot() {
  initTheme();
  shell();
  $('#results').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  try {
    data = await loadData();
  } catch (err) {
    $('#results').innerHTML = `<section class="panel empty"><h2>Couldn't load the index</h2><p class="muted">${esc((err as Error).message)}. If you're running locally, generate it first with <code>npm run build:index</code>.</p></section>`;
    return;
  }
  byId = new Map(data.items.map((i) => [i.id, i]));
  releaseById = new Map(data.releases.map((r) => [r.id, r]));
  allTrainsAsc = data.releases.map((r) => r.id).sort((a, b) => trainKey(a) - trainKey(b));
  data.releases.sort((a, b) => compareTrainsDesc(a.id, b.id));
  searcher = new Searcher(data.items);

  state = parseState(location.search);
  if (state.release && !releaseById.has(state.release)) state.release = null;
  if (state.id && !byId.has(state.id)) state.id = null;
  renderFooter();
  renderNotice();
  bind();
  update();
  if (!state.q && !state.id) $('#q').focus({ preventScroll: true });
}

void boot();
