import { ICONS, STATUS_LABEL, TYPE_LABEL, TYPE_SHORT, bestError, esc, fmtDate, highlight, snippet } from './format';
import { summarizeReleases } from './versions';
import type { Affects, IndexData, Item, Release } from './types';

export interface CardContext {
  terms: string[];
  affects: Affects | null;
  release: Release | null;
  allTrainsAsc: string[];
}

const AFFECTS_LABEL: Record<Affects, string> = {
  yes: 'Affects',
  maybe: 'No release stated',
  'fixed-later': 'Fixed in a later release',
  no: '',
};

function badges(item: Item, ctx: CardContext): string {
  const out: string[] = [`<span class="badge type type-${item.type}">${esc(TYPE_SHORT[item.type])}</span>`];
  if (item.area) out.push(`<span class="badge area">${esc(item.area)}</span>`);
  if (item.status) {
    const fixed = item.status === 'fixed' && item.fixedIn ? ` in ${esc(item.fixedIn)}` : '';
    out.push(`<span class="badge status status-${item.status}">${esc(STATUS_LABEL[item.status])}${fixed}</span>`);
  }
  if (ctx.release && ctx.affects === 'no') {
    out.push(`<span class="badge affects affects-no" title="Not listed for ${esc(ctx.release.id)}">Not listed for ${esc(ctx.release.id)}</span>`);
  } else if (ctx.release && ctx.affects && ctx.affects !== 'no') {
    const label =
      ctx.affects === 'yes'
        ? `Affects ${esc(ctx.release.id)}`
        : ctx.affects === 'fixed-later' && item.fixedIn
          ? `Fixed in ${esc(item.fixedIn)} — upgrade`
          : AFFECTS_LABEL[ctx.affects];
    out.push(`<span class="badge affects affects-${ctx.affects}">${label}</span>`);
  }
  if (item.flags.length) out.push(`<span class="badge flag" title="${esc(item.flags.map((f) => f.message).join('\n'))}">${ICONS.warn}${item.flags.length}</span>`);
  return out.join('');
}

export function primaryLink(item: Item): { label: string; url: string } {
  if (item.type === 'tsg') return { label: 'Open TSG on GitHub', url: item.url };
  if (item.type === 'known-issue') return { label: 'Open in Learn', url: item.url };
  return { label: 'Release info on Learn', url: item.url };
}

export function renderCard(item: Item, ctx: CardContext): string {
  const norm = (s: string) => s.toLowerCase().replace(/[…\s]+/g, ' ').trim();
  let summary = item.symptomSummary ?? item.symptoms;
  // Known issues often open with the very sentence used as the title; don't say it twice.
  if (summary && norm(summary).startsWith(norm(item.title).replace(/ $/, '')) && summary.length <= item.title.length + 40) summary = null;
  const err = bestError([...item.errorStrings, ...item.aliases.slice(0, 0)], ctx.terms);
  const fix = item.mitigationSummary;
  const versions = summarizeReleases(item.releases, ctx.allTrainsAsc);
  const link = primaryLink(item);
  const os = item.osVersions.length ? item.osVersions.join(' / ') : '';
  const meta = [versions ? `Releases ${versions}` : item.versionText, os && !versions ? os : ''].filter(Boolean).join(' · ');
  return `
  <article class="card" data-open="${esc(item.id)}" tabindex="0" aria-label="${esc(item.title)}">
    <div class="card-badges">${badges(item, ctx)}<span class="spacer"></span>${item.lastUpdated ? `<time class="muted small" datetime="${esc(item.lastUpdated)}">${esc(fmtDate(item.lastUpdated))}</time>` : ''}</div>
    <h3 class="card-title">${highlight(item.title, ctx.terms)}</h3>
    ${summary ? `<p class="card-text">${highlight(snippet(summary, ctx.terms, 260), ctx.terms)}</p>` : ''}
    ${err ? `<pre class="card-err"><code>${highlight(snippet(err, ctx.terms, 220), ctx.terms)}</code></pre>` : ''}
    ${fix ? `<p class="card-fix"><span class="label">Fix</span>${highlight(snippet(fix, ctx.terms, 220), ctx.terms)}</p>` : ''}
    <div class="card-foot">
      <span class="muted small card-meta">${esc(meta)}${item.enrichment ? `<span class="enriched" title="Summary, aliases and links refined by Copilot (${esc(item.enrichment.confidence)} confidence)">${ICONS.spark}Copilot-enriched</span>` : ''}</span>
      <span class="card-actions">
        <a class="link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)}${ICONS.external}</a>
        <button class="btn small" type="button" data-open="${esc(item.id)}">Details</button>
      </span>
    </div>
  </article>`;
}

function codeBlock(text: string): string {
  return `<div class="codeblock"><pre><code>${esc(text)}</code></pre><button class="icon-btn copy" type="button" data-copy="${esc(text)}" aria-label="Copy" title="Copy">${ICONS.copy}</button></div>`;
}

export function renderDrawer(item: Item, data: IndexData, byId: Map<string, Item>, allTrainsAsc: string[]): string {
  const versions = summarizeReleases(item.releases, allTrainsAsc);
  const links = [{ label: primaryLink(item).label, url: item.url }, ...item.urls.filter((u) => u.url !== item.url)];
  const related = item.related
    .map((r) => ({ r, target: byId.get(r.id) }))
    .filter((x): x is { r: (typeof item.related)[number]; target: Item } => Boolean(x.target));
  const facts: [string, string][] = [
    ['Type', TYPE_LABEL[item.type]],
    ['Area', [item.area, item.subarea].filter(Boolean).join(' › ')],
    ['Status', item.status ? STATUS_LABEL[item.status] + (item.fixedIn ? ` (fixed in ${item.fixedIn})` : '') : ''],
    ['Releases', versions || (item.versionText ?? '')],
    ['OS', item.osVersions.join(', ')],
    ['Solution versions', item.solutionVersions.join(', ')],
    ['First listed', item.introducedIn ?? ''],
    ['Last updated', fmtDate(item.lastUpdated)],
    ['Source', item.source ?? ''],
  ].filter(([, v]) => v) as [string, string][];

  const section = (title: string, body: string) => (body ? `<section class="dsec"><h4>${esc(title)}</h4>${body}</section>` : '');

  return `
  <div class="drawer-head">
    <div class="card-badges">${badges(item, { terms: [], affects: null, release: null, allTrainsAsc })}</div>
    <button class="icon-btn" type="button" data-close aria-label="Close details">${ICONS.close}</button>
  </div>
  <h2 class="drawer-title" id="drawer-title">${esc(item.title)}</h2>
  <div class="drawer-links">${links.map((l) => `<a class="btn primary small" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}${ICONS.external}</a>`).join('')}<button class="btn small" type="button" data-share>${ICONS.link}Copy link</button></div>
  ${item.flags.length ? `<div class="callout warn">${ICONS.warn}<div>${item.flags.map((f) => `<p><strong>${esc(f.kind.replace(/-/g, ' '))}:</strong> ${esc(f.message)}</p>`).join('')}</div></div>` : ''}
  ${section('Symptoms', `${item.symptomSummary ? `<p class="lead">${esc(item.symptomSummary)}</p>` : ''}${item.symptoms ? `<p class="prewrap">${esc(item.symptoms)}</p>` : ''}`)}
  ${section('Error text', item.errorStrings.map(codeBlock).join(''))}
  ${item.errorCodes.length ? section('Codes & identifiers', `<div class="chips">${item.errorCodes.map((c) => `<button class="chip code" type="button" data-search="${esc(c)}" title="Search for ${esc(c)}">${esc(c)}</button>`).join('')}</div>`) : ''}
  ${item.aliases.length ? section('Also searchable as', `<div class="chips">${item.aliases.map((a) => `<button class="chip" type="button" data-search="${esc(a)}">${esc(a)}</button>`).join('')}</div>`) : ''}
  ${section('Mitigation', `${item.mitigationSummary ? `<p class="lead">${esc(item.mitigationSummary)}</p>` : ''}${item.mitigation ? `<p class="prewrap">${esc(item.mitigation)}</p>` : ''}${item.type === 'tsg' ? `<p class="muted small">The full step-by-step guide, screenshots and scripts are in the source TSG.</p>` : ''}`)}
  ${item.releases.length ? section('Affected releases', `<div class="chips">${[...item.releases].reverse().map((r) => `<button class="chip" type="button" data-release="${esc(r)}" title="Show issues for ${esc(r)}">${esc(r)}</button>`).join('')}</div>`) : ''}
  ${related.length ? section('Related', `<ul class="related">${related.map(({ r, target }) => `<li><button type="button" class="rel" data-open="${esc(target.id)}"><span class="badge type type-${target.type}">${esc(TYPE_SHORT[target.type])}</span><span class="rel-title">${esc(target.title)}</span><span class="muted small">${esc(r.relation.replace(/-/g, ' '))}${r.reason ? ` — ${esc(r.reason)}` : ''}</span></button></li>`).join('')}</ul>`) : ''}
  ${section('Details', `<dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`)}
  ${item.enrichment ? `<p class="muted small enrich-note">${ICONS.spark}Summaries, aliases and cross-links were refined by Copilot on ${esc(fmtDate(item.enrichment.enrichedAt))} (${esc(item.enrichment.confidence)} confidence). The original text above always comes from the source documents.</p>` : ''}
  <p class="muted small">Index built ${esc(fmtDate(data.generatedAt))}.</p>`;
}
