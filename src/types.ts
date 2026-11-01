export type ItemType = 'tsg' | 'known-issue' | 'release';
export type ItemStatus = 'open' | 'fixed' | 'expected' | null;

export interface Link {
  label: string;
  url: string;
}

export interface Related {
  id: string;
  relation: string;
  reason: string | null;
}

export interface Flag {
  kind: string;
  message: string;
}

export interface EnrichmentMeta {
  provider: string;
  model: string | null;
  enrichedAt: string;
  promptVersion: number;
  confidence: 'high' | 'medium' | 'low';
  applied: string[];
}

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  area: string | null;
  subarea: string | null;
  status: ItemStatus;
  releases: string[];
  osVersions: string[];
  solutionVersions: string[];
  versionText: string | null;
  introducedIn: string | null;
  fixedIn: string | null;
  symptoms: string | null;
  symptomSummary: string | null;
  errorStrings: string[];
  errorCodes: string[];
  aliases: string[];
  mitigationSummary: string | null;
  mitigation: string | null;
  url: string;
  urls: Link[];
  lastUpdated: string | null;
  sourceHash: string | null;
  source: string | null;
  related: Related[];
  flags: Flag[];
  enrichment: EnrichmentMeta | null;
  excerpt: string | null;
  release: { train: string; supported: boolean; osBuilds: string[]; availabilityDate: string | null } | null;
}

export interface Release {
  id: string;
  label?: string;
  supported: boolean;
  isLatest?: boolean;
  availabilityDate: string | null;
  osVersions: string[];
  osBuilds?: string[];
  solutionVersions: { version: string; osVersion: string | null; osBuild: string | null; availabilityDate: string | null }[];
}

export interface IndexData {
  schemaVersion: 1;
  generatedAt: string;
  sources: { name: string; url: string; ref?: string | null; count?: number }[];
  stats?: Record<string, number>;
  enrichment: { provider: string; model: string | null; enrichedItems: number; pendingItems: number; generatedAt: string } | null;
  degraded?: { source: 'tsg' | 'learn'; since: string; checkedAt?: string; reason: string }[];
  releases: Release[];
  items: Item[];
}

export type Affects = 'yes' | 'maybe' | 'fixed-later' | 'no';

export type ViewMode = 'search' | 'version';

export interface State {
  q: string;
  view: ViewMode;
  release: string | null;
  types: ItemType[];
  areas: string[];
  statuses: Exclude<ItemStatus, null>[];
  sort: 'relevance' | 'updated';
  id: string | null;
}
