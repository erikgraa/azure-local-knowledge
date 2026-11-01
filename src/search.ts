import MiniSearch from 'minisearch';
import type { Item } from './types';

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'be', 'at', 'by', 'with', 'from', 'this', 'that', 'it', 'as']);

/** Words, plus the dotted/camelCase/underscore parts of identifiers (SecretNotFoundException -> secret, not, found...). */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s"'`<>()[\]{}:;,|=\\/!?*+~^$#@%&]+/)) {
    const word = raw.replace(/^[.\-_]+|[.\-_]+$/g, '');
    if (!word) continue;
    out.push(word);
    const parts = word
      .split(/[._-]+/)
      .flatMap((p) => p.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/))
      .filter((p) => p.length > 1);
    if (parts.length > 1 || parts[0] !== word) out.push(...parts);
  }
  return out;
}

const processTerm = (term: string): string | null => {
  const t = term.toLowerCase();
  return STOP.has(t) ? null : t;
};

/** Strip the machine-specific noise from a pasted error so the rest matches the documented text. */
export function normalizeQuery(q: string): string {
  return q
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?Z?\b/g, ' ')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Hit {
  item: Item;
  score: number;
  terms: string[];
}

interface Doc {
  id: string;
  title: string;
  area: string;
  aliases: string;
  errors: string;
  codes: string;
  symptoms: string;
  mitigation: string;
  versions: string;
  excerpt: string;
}

const wordSet = (text: string): Set<string> =>
  new Set(tokenize(text).map((t) => t.toLowerCase()).filter((t) => t.length > 2 && !STOP.has(t)));

/** Words only (no identifier sub-tokens): used for the primary, high-precision pass. */
export function wholeTokens(text: string): string[] {
  return text
    .split(/[\s"'`<>()[\]{}:;,|=\\/!?*+~^$#@%&]+/)
    .map((w) => w.replace(/^[.\-_]+|[.\-_]+$/g, ''))
    .filter(Boolean);
}

export class Searcher {
  private mini: MiniSearch<Doc>;
  private byId = new Map<string, Item>();
  private phrase = new Map<string, string>();
  private words = new Map<string, Set<string>>();

  constructor(items: Item[]) {
    this.mini = new MiniSearch<Doc>({
      fields: ['title', 'area', 'aliases', 'errors', 'codes', 'symptoms', 'mitigation', 'versions', 'excerpt'],
      storeFields: ['id'],
      tokenize,
      processTerm,
      searchOptions: {
        boost: { codes: 6, errors: 4, aliases: 4, title: 3, symptoms: 2, area: 1, versions: 1, mitigation: 1, excerpt: 0.4 },
        prefix: (term) => term.length > 3,
        fuzzy: (term) => (term.length > 5 ? 0.2 : false),
        combineWith: 'OR',
      },
    });
    const docs: Doc[] = items.map((it) => {
      this.byId.set(it.id, it);
      const signal = [it.title, ...it.errorStrings, ...it.aliases, ...it.errorCodes].join(' \n ');
      this.phrase.set(it.id, signal.toLowerCase().replace(/\s+/g, ' '));
      this.words.set(it.id, wordSet(signal));
      return {
        id: it.id,
        title: it.title,
        area: [it.area, it.subarea].filter(Boolean).join(' '),
        aliases: it.aliases.join(' \n '),
        errors: it.errorStrings.join(' \n '),
        codes: it.errorCodes.join(' '),
        symptoms: [it.symptomSummary, it.symptoms].filter(Boolean).join(' '),
        mitigation: [it.mitigationSummary, it.mitigation].filter(Boolean).join(' '),
        versions: [...it.releases, ...it.solutionVersions, ...it.osVersions, it.versionText, it.fixedIn, it.introducedIn].filter(Boolean).join(' '),
        excerpt: it.excerpt ?? '',
      };
    });
    this.mini.addAll(docs);
  }

  search(rawQuery: string): Hit[] {
    const query = normalizeQuery(rawQuery);
    if (!query) return [];
    const long = tokenize(query).length > 14;
    const opts = long ? { fuzzy: false as const, prefix: false as const } : {};
    // Pass A matches whole identifiers (SecretNotFoundException); pass B also matches their parts at low weight.
    const exact = this.mini.search(query, { ...opts, tokenize: wholeTokens });
    const loose = this.mini.search(query, opts);

    const merged = new Map<string, { score: number; terms: Set<string> }>();
    const add = (list: typeof exact, weight: number) => {
      for (const r of list) {
        const cur = merged.get(r.id) ?? { score: 0, terms: new Set<string>() };
        cur.score += r.score * weight;
        r.terms.forEach((t) => cur.terms.add(t));
        merged.set(r.id, cur);
      }
    };
    add(exact, 1);
    add(loose, 0.2);

    const phrase = query.toLowerCase().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '');
    const qWords = wordSet(query);
    const hits: Hit[] = [];
    for (const [id, m] of merged) {
      const item = this.byId.get(id);
      if (!item) continue;
      let score = m.score;
      if (phrase.length >= 6 && this.phrase.get(id)?.includes(phrase)) score *= 2.5;
      if (qWords.size >= 3) {
        const have = this.words.get(id)!;
        let overlap = 0;
        for (const w of qWords) if (have.has(w)) overlap++;
        score *= 1 + 1.5 * (overlap / qWords.size);
      }
      hits.push({ item, score, terms: [...m.terms] });
    }
    hits.sort((a, b) => b.score - a.score);
    // Drop the long tail of incidental matches (e.g. everything that merely mentions "exception").
    const floor = (hits[0]?.score ?? 0) * 0.08;
    return hits.filter((h) => h.score >= floor);
  }
}

/** Query words worth highlighting in result text. */
export function highlightTerms(rawQuery: string): string[] {
  const seen = new Set<string>();
  for (const t of tokenize(normalizeQuery(rawQuery))) {
    const w = t.toLowerCase();
    if (w.length > 2 && !STOP.has(w)) seen.add(w);
  }
  return [...seen].sort((a, b) => b.length - a.length).slice(0, 24);
}
