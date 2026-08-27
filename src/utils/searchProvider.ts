// Search provider abstraction.
//
// 'stdb' — server-side keyword search via the search_profiles procedure on
//          SpacetimeDB (maincloud). Always available, zero new infrastructure.
//          This is the permanent baseline; it replaced the old client-side
//          full-table scan which could not scale past ~10k profiles.
// 'gpu'  — semantic hybrid search on the self-hosted GPU box (dense+sparse
//          fusion + cross-encoder rerank). Strictly additive: selected per
//          caller tier when the box is reachable; falls back to 'stdb'.
//
// Tier → provider mapping (resolved by the caller):
//   anonymous → gpu(orgs only) with stdb fallback
//   free      → stdb(people) + gpu(orgs) with stdb fallback
//   pro       → gpu(everything) with stdb fallback

import { getDbConnection } from './spacetime';
import { haversineMiles } from './geo';

export interface SearchResult {
  type: 'person' | 'org';
  identity: string;
  orgId?: bigint;
  email: string;
  fullName: string;
  profilePicture: string;
  city: string;
  description: string;
  locationLat?: number;
  locationLng?: number;
  distance?: number;
}

export interface SearchFilters {
  gender?: string; // 'any' | 'male' | 'female' | 'other'
  ageMin?: number;
  ageMax?: number;
  showIndividuals?: boolean;
  showOrganizations?: boolean;
  limit?: number;
}

export type SearchMode = 'stdb' | 'gpu';

export function getSearchProvider(): SearchMode {
  const stored = localStorage.getItem('veri_searchProvider') as SearchMode | null;
  if (stored === 'gpu' || stored === 'stdb') return stored;
  // Default: descriptive (GPU) search for signed-in users; keyword for anon.
  try {
    if (localStorage.getItem('veri_oauth_session')) return 'gpu';
  } catch { }
  return 'stdb';
}

export function setSearchProvider(m: SearchMode): void {
  localStorage.setItem('veri_searchProvider', m);
}

async function callStdbSearch(params: Record<string, unknown>): Promise<{
  results: SearchResult[];
  nextCursor?: string;
}> {
  const db = getDbConnection();
  if (!db) throw new Error('Not connected to SpacetimeDB');
  // @ts-expect-error — procedures map is generated without a static type for dynamic calls
  const result = await db.procedures.searchProfiles(params);
  const out: SearchResult[] = (result?.results ?? []).map((r: any) => ({
    type: r.resultType === 'org' ? ('org' as const) : ('person' as const),
    identity: r.identityHex || '',
    orgId: r.orgId !== undefined && r.orgId !== null ? BigInt(r.orgId) : undefined,
    email: r.email || '',
    fullName: r.fullName || '',
    profilePicture: r.profilePicture || '',
    city: r.city || '',
    description: r.description || '',
    locationLat: r.locationLat ?? undefined,
    locationLng: r.locationLng ?? undefined,
  }));
  return { results: out, nextCursor: result?.nextCursor ?? undefined };
}

// Legacy direct-HTTP GPU search retained for reference; superseded by the
// SpacetimeDB event-table bridge in ./semanticSearch (no public endpoint).

// One-shot keyword search against SpacetimeDB. Handles pagination internally:
// keeps pulling cursors until the page is filled or rows are exhausted.
export async function keywordSearch(
  query: string,
  filters: SearchFilters
): Promise<{ results: SearchResult[]; degraded: boolean }> {
  let cursor: string | undefined;
  const all: SearchResult[] = [];
  try {
    for (let page = 0; page < 5; page++) {
      const { results, nextCursor } = await callStdbSearch({
        query,
        searchType:
          filters.showIndividuals === false && filters.showOrganizations !== false
            ? 'org'
            : filters.showOrganizations === false && filters.showIndividuals !== false
              ? 'person'
              : 'any',
        gender: filters.gender && filters.gender !== 'any' ? filters.gender : undefined,
        ageMin: filters.ageMin,
        ageMax: filters.ageMax,
        cursor,
        limit: 50,
      });
      all.push(...results);
      if (!nextCursor) break;
      cursor = nextCursor;
      if (all.length >= (filters.limit ?? 60)) break;
    }
    return { results: all, degraded: false };
  } catch (e) {
    console.error('keywordSearch failed:', e);
    return { results: [], degraded: true };
  }
}

// Tier-aware entry point used by SearchPage.
export async function runSearch(
  query: string,
  opts: {
    tier: 'anon' | 'free' | 'pro';
    filters: SearchFilters;
    activePos: { lat: number; lng: number } | null;
  }
): Promise<SearchResult[]> {
  const provider = opts.tier === 'anon' ? 'stdb' : getSearchProvider();

  // Product rule: anonymous callers only see organizations. Enforced here at
  // the provider so no caller (or stale UI state) can widen anonymous scope.
  const filters: SearchFilters =
    opts.tier === 'anon'
      ? { ...opts.filters, showIndividuals: false, showOrganizations: true }
      : opts.filters;

  if (provider === 'gpu') {
    try {
      // Semantic path: SpacetimeDB event-table bridge to the GPU box.
      const { semanticSearch } = await import('./semanticSearch');
      const gpuResults = await semanticSearch(query, filters);
      if (gpuResults.length > 0) return decorate(gpuResults, opts.activePos);
      // Empty semantic results legitimately happen; still fall through to
      // keyword so exact matches are never missed.
    } catch (e: any) {
      if (e?.message === 'allowance_exhausted' || e?.message === 'allowance_disabled') {
        const err = new Error(e.message);
        (err as any).code = e.message;
        throw err;
      }
      console.warn('GPU search unavailable, falling back to keyword:', e);
    }
  }

  const { results } = await keywordSearch(query, filters);
  return decorate(results, opts.activePos);
}

function decorate(
  results: SearchResult[],
  activePos: { lat: number; lng: number } | null
): SearchResult[] {
  return results.map((r) => ({
    ...r,
    distance:
      activePos && r.locationLat !== undefined && r.locationLng !== undefined
        ? haversineMiles(activePos.lat, activePos.lng, r.locationLat, r.locationLng)
        : undefined,
  }));
}
