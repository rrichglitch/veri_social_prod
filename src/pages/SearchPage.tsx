import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, Link, useNavigate, useNavigationType } from 'react-router-dom';
import { isSignedIn } from '../utils/authState';
import { getOAuthSession } from '../utils/oauthSession';
import { useApp } from '../App';
import { connectToSpacetimeDB, getProfileByEmail, getDbConnection, getOrganizationById } from '../utils/spacetime';
import { runSearch as executeSearch, type SearchResult, type SearchMode, getSearchProvider, setSearchProvider } from '../utils/searchProvider';
import { formatMiles } from '../utils/geo';

// Local helper so the identity-resolution path keeps working without leaking
// the connection handle into the search path.
const getDbConnectionSafe = getDbConnection;
import {
} from '../utils/searchHistory';

import MapView from '../components/MapView';
import SwipeView from '../components/SwipeView';
import ProfileTabs from '../components/ProfileTabs';
import TopBar from '../components/TopBar';
import SearchBar from '../components/SearchBar';
import AuthActions from '../components/AuthActions';
import { useOrg } from '../contexts/OrgContext';

// Results cache for the current SPA session: back/forward navigation
// remounts this page, and re-running the search for a query whose
// results we already have wastes bandwidth (user-mandated). Module scope
// survives unmounts; a fresh page load starts empty so hard refreshes
// always search fresh.
const searchResultCache = new Map<string, { results: SearchResult[]; allowanceNotice: string | null }>();

function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigationType = useNavigationType();

  // Arriving with ?opts=1 (options button tapped on another page) opens the
  // options menu, then strips the param so refresh/back don't re-trigger.
  useEffect(() => {
    if (searchParams.get('opts') === '1') {
      setShowSearchOptions(true);
      const p = new URLSearchParams(searchParams);
      p.delete('opts');
      const rest = p.toString();
      navigate(`/search${rest ? `?${rest}` : ''}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const query = searchParams.get('q') || '';
  const navigate = useNavigate();
  const { email } = useApp();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allowanceNotice, setAllowanceNotice] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState(query);
  // Sync the bar whenever the URL query changes (suggestion clicks, submits).
  // The flag marks changes that came from a performed search so the reopen
  // effect below can tell them apart from manual edits.
  const urlSyncRef = useRef(false);
  const prevQueryRef = useRef(query);
  // Sync the bar ONLY when the URL query actually changes (suggestion clicks,
  // submits). Manual typing changes inputValue without touching query, so it
  // is never clobbered back to the previous search.
  useEffect(() => {
    if (query !== prevQueryRef.current) {
      prevQueryRef.current = query;
      urlSyncRef.current = true;
      setInputValue(query);
    }
  }, [query]);

  const [isConnected, setIsConnected] = useState(false);
  const signedIn = isSignedIn();
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyFirst, setNearbyFirst] = useState<boolean>(() => localStorage.getItem('veri_nearbyFirst') === '1');
  const [mode, setMode] = useState<'list' | 'map' | 'swipe'>(() => (localStorage.getItem('veri_searchMode') as 'list' | 'map' | 'swipe') || 'list');
  const [providerMode, setProviderMode] = useState<SearchMode>(() => getSearchProvider());
  const switchProvider = (m: SearchMode) => {
    setSearchProvider(m);
    setProviderMode(m);
  };
  const [isDesktop, setIsDesktop] = useState<boolean>(() => window.matchMedia('(min-width: 768px)').matches);
  const [myIdentity, setMyIdentity] = useState<string>('');
  const [swipeIndex, setSwipeIndex] = useState(0);

  // Stable identity for SwipeView — a fresh array every render would reset its position
  const swipeResults = useMemo(
    () => results.map(r => ({
      type: r.type,
      identity: r.identity,
      orgId: r.orgId,
      email: r.email,
      fullName: r.fullName,
      // Swipe background = the FULL picture (S3 URL), thumbnails everywhere else
      fullPicture: r.fullPicture || r.profilePicture,
      profilePicture: r.profilePicture,
      city: r.city,
      description: r.description,
    })),
    [results]
  );

  const { activeOrg } = useOrg();
  const [searchLoc, setSearchLoc] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [showLocModal, setShowLocModal] = useState(false);
  const [showSearchOptions, setShowSearchOptions] = useState(false);
  // Bumped on every explicit submit so re-running the SAME query still
  // triggers a fresh search (e.g. after changing the options).
  const [searchTick, setSearchTick] = useState(0);
  const [genderFilter, setGenderFilter] = useState<string>(() => localStorage.getItem('veri_genderFilter') || 'any');
  const [ageMin, setAgeMin] = useState<string>(() => localStorage.getItem('veri_ageMin') || '');
  const [ageMax, setAgeMax] = useState<string>(() => localStorage.getItem('veri_ageMax') || '');
  const [showIndividuals, setShowIndividuals] = useState<boolean>(() => {
    // ?claimable=1 (silent param from "Claim Existing Organization"): orgs only.
    if (new URLSearchParams(window.location.search).get('claimable') === '1') return false;
    return localStorage.getItem('veri_showIndividuals') !== '0';
  });
  const [showOrganizations, setShowOrganizations] = useState<boolean>(() => {
    if (new URLSearchParams(window.location.search).get('claimable') === '1') return true;
    return localStorage.getItem('veri_showOrganizations') !== '0';
  });
  // Silent claim-mode: orgs WITHOUT a leader only (backend-seeded, claimable).
  const [claimableOnly, setClaimableOnly] = useState<boolean>(() => new URLSearchParams(window.location.search).get('claimable') === '1');
  // Search-option changes exit claim mode: the leaderless restriction is a
  // curated flow, so once the user starts narrowing what's being searched
  // (Show toggles, gender, age) it quietly reverts to a normal search. The
  // query field, the keyword/descriptive provider toggle, and location do NOT
  // drop it — they only change how/where the same leaderless set is searched.
  // The URL param is stripped too (replace, no history entry) so the current
  // page no longer carries it.
  const dropClaimable = () => {
    if (!claimableOnly) return;
    setClaimableOnly(false);
    const p = new URLSearchParams(window.location.search);
    if (p.get('claimable') === '1') {
      p.delete('claimable');
      const rest = p.toString();
      navigate(`/search${rest ? `?${rest}` : ''}`, { replace: true });
    }
  };
  const searchOptionsRef = useRef<HTMLDivElement>(null);
  const [locInput, setLocInput] = useState('');
  const [locSuggestions, setLocSuggestions] = useState<{ place_id: number; display_name: string; lat: string; lon: string }[]>([]);
  const locFetchSeqRef = useRef(0);

  // Persist mode + nearby-first state across navigation and browser restarts
  useEffect(() => { localStorage.setItem('veri_searchMode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('veri_genderFilter', genderFilter); }, [genderFilter]);
  useEffect(() => { localStorage.setItem('veri_ageMin', ageMin); }, [ageMin]);
  useEffect(() => { localStorage.setItem('veri_ageMax', ageMax); }, [ageMax]);
  useEffect(() => { if (!claimableOnly) localStorage.setItem('veri_showIndividuals', showIndividuals ? '1' : '0'); }, [showIndividuals]);
  useEffect(() => { if (!claimableOnly) localStorage.setItem('veri_showOrganizations', showOrganizations ? '1' : '0'); }, [showOrganizations]);
  useEffect(() => { localStorage.setItem('veri_nearbyFirst', nearbyFirst ? '1' : '0'); }, [nearbyFirst]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Close the search options menu on outside click
  useEffect(() => {
    if (!showSearchOptions) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      // Ignore clicks on the options toggle itself — it handles its own toggle.
      if ((t as HTMLElement)?.closest?.('.search-options-btn')) return;
      if (searchOptionsRef.current && !searchOptionsRef.current.contains(t)) {
        setShowSearchOptions(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showSearchOptions]);

  // Dynamic suggestions for the search-location dropdown (Nominatim typeahead, debounced)
  useEffect(() => {
    const q = locInput.trim();
    if (q.length < 2) { setLocSuggestions([]); return; }
    const seq = ++locFetchSeqRef.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (seq !== locFetchSeqRef.current) return; // stale response
        setLocSuggestions(Array.isArray(data) ? data : []);
      } catch { /* ignore suggestion failures */ }
    }, 300);
    return () => clearTimeout(t);
  }, [locInput]);

  // Background: try to connect
  useEffect(() => {
    const init = async () => {
      try {
        // /search is OUTSIDE AuthGate, so it must establish the right
        // connection itself: with the session token when one exists
        // (descriptive search + allowance run under the user identity),
        // anonymous otherwise. Connecting anonymously here — as it
        // previously did — runs the search as the anon identity (orgs-only
        // tier, no gpu allowance) and results stay empty after login until
        // the page remounts.
        const session = getOAuthSession();
        if (session) {
          await connectToSpacetimeDB(session.email, session.stToken);
        } else {
          await connectToSpacetimeDB('', undefined);
        }
        setIsConnected(true);
      } catch (e) {
        console.log('Connect failed:', e);
      }
    };
    init();
  }, []);

  // Load my stored location (only if not 'off')
  // Resolve the viewer identity, retrying until it lands (the cache may not be
  // ready on the first attempt). Falls back to the connection identity.
  const myIdentityRef = useRef('');
  useEffect(() => {
    if (!email) return;
    let alive = true;
    const resolve = async () => {
      if (myIdentityRef.current) return;
      const p = await getProfileByEmail(email).catch(() => null);
      if (!alive) return;
      if (p) {
        myIdentityRef.current = p.identity.toHexString();
        setMyIdentity(p.identity.toHexString());
        if (p.locationPrecision !== 'off' && p.locationLat !== undefined && p.locationLng !== undefined) {
          setMyPos({ lat: p.locationLat, lng: p.locationLng });
        }
      } else {
        const db = getDbConnectionSafe();
        if (db?.identity) {
          myIdentityRef.current = db.identity.toHexString();
          setMyIdentity(db.identity.toHexString());
        }
      }
    };
    resolve();
    const t = setInterval(resolve, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [email, isConnected]);

  // The active reference point: an explicitly set search location wins over the saved one
  const activePos = useMemo(
    () => (searchLoc ? { lat: searchLoc.lat, lng: searchLoc.lng } : myPos),
    [searchLoc, myPos]
  );

  useEffect(() => {
    let cancelled = false;
    // Back/forward (POP) remounts reuse cached results for the same
    // query+filters+location+provider — no fresh search, no bandwidth.
    const cacheKey = JSON.stringify({
      q: query, g: genderFilter, a1: ageMin, a2: ageMax,
      i: showIndividuals, o: showOrganizations, p: providerMode, c: claimableOnly ? 1 : 0,
      loc: activePos ? [activePos.lat, activePos.lng] : null,
    });
    if (navigationType === 'POP') {
      const hit = searchResultCache.get(cacheKey);
      if (hit) {
        const sorted = nearbyFirst
          ? [...hit.results].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
          : hit.results;
        setResults(sorted);
        setAllowanceNotice(hit.allowanceNotice);
        setIsLoading(false);
        return;
      }
    }
    const searchQuery = async () => {
      if (!query.trim()) {
        setResults([]);
        setAllowanceNotice(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Server-side search via the searchProvider abstraction:
        //   'stdb' → keyword procedure on SpacetimeDB (always available)
        //   'gpu'  → semantic hybrid on the GPU box, keyword fallback
        // Claim-mode (silent ?claimable=1): only organizations, and only ones that
        // have NO leader yet (backend-seeded rows with the zero identity) — the
        // ones available to be claimed.
        const ZERO_LEADER = '0000000000000000000000000000000000000000000000000000000000000000';
        const effIndividuals = claimableOnly ? false : showIndividuals;
        const effOrganizations = claimableOnly ? true : showOrganizations;
        const found = await executeSearch(query, {
          tier: isSignedIn() ? 'free' : 'anon',
          filters: {
            gender: genderFilter,
            ageMin: ageMin ? parseInt(ageMin, 10) : undefined,
            ageMax: ageMax ? parseInt(ageMax, 10) : undefined,
            showIndividuals: effIndividuals,
            showOrganizations: effOrganizations,
            limit: 60,
          },
          activePos,
        });
        if (cancelled) return;

        let filtered = found;
        if (claimableOnly) {
          filtered = found.filter((r) => {
            if (r.type !== 'org' || r.orgId === undefined) return false;
            const org = getOrganizationById(r.orgId);
            if (!org) return false;
            const leaderHex =
              typeof (org as any).leaderIdentity?.toHexString === 'function'
                ? (org as any).leaderIdentity.toHexString()
                : String((org as any).leaderIdentity ?? '');
            return leaderHex.toLowerCase() === ZERO_LEADER;
          });
        }

        // Nearby-first sorting (distance was computed in the provider)
        if (nearbyFirst) {
          filtered.sort((a, b) => {
            const da = a.distance ?? Infinity;
            const db = b.distance ?? Infinity;
            return da - db;
          });
        }

        setResults(filtered);
        // Remember for back/forward remounts (cap so the map can't grow unbounded)
        searchResultCache.set(cacheKey, { results: filtered, allowanceNotice });
        if (searchResultCache.size > 12) {
          const oldest = searchResultCache.keys().next().value;
          if (oldest !== undefined) searchResultCache.delete(oldest);
        }
      } catch (e: any) {
        if (e?.message === 'allowance_exhausted') {
          const { fetchMyAllowance, allowanceMessage } = await import('../utils/allowance');
          const info = await fetchMyAllowance();
          setAllowanceNotice(
            info ? allowanceMessage(info) :
              'You\'re out of descriptive searches. Unlock unlimited by upgrading to Pro — or earn more by commenting on your friends\' profiles to build your reputation.'
          );
        } else if (e?.message === 'allowance_disabled') {
          setAllowanceNotice('Your ability to earn descriptive searches has been disabled.');
        } else {
          console.error('Search error:', e);
        }
      }
      if (!cancelled) setIsLoading(false);
    };

    searchQuery();
    return () => { cancelled = true; };
    // signedIn must be a dep: signing in/out after a cold load changes the
    // tier (anon = orgs only) — without it the stale empty result persists
    // until the page is remounted.
  }, [query, isConnected, activePos, nearbyFirst, genderFilter, ageMin, ageMax, showIndividuals, showOrganizations, searchTick, signedIn, navigationType, providerMode, claimableOnly]);

  return (
    <div className="search-page">
      <TopBar
        left={<Link to={isSignedIn() ? '/home' : '/'} className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        center={<div className="topbar-search-wrap">
          <SearchBar
            onSearch={(q) => {
              if (q.trim()) {
                setShowSearchOptions(false);
                // If the query is unchanged (e.g. options were just updated),
                // the URL won't change — force a re-run via the tick.
                if (q.trim() === query) setSearchTick((t) => t + 1);
                // A new query KEEPS claim mode: describing the org you want
                // to claim must not drop the leaderless criteria (only option
                // changes do, via dropClaimable). Preserving the param in the
                // URL also keeps it across remounts (refresh, back-nav).
                const p = new URLSearchParams(window.location.search);
                p.set('q', q.trim());
                if (!claimableOnly) p.delete('claimable');
                navigate(`/search?${p.toString()}`);
              }
            }}
            value={inputValue}
            onChange={setInputValue}
            onOptionsClick={signedIn ? () => setShowSearchOptions((v) => !v) : undefined}
            onInputFocus={() => setShowSearchOptions(false)}
          />
          {showSearchOptions && (
            <div className="search-options-menu" ref={searchOptionsRef}>
              {isSignedIn() && (
                <div className="search-opt-section">
                  <span className="search-opt-label">Search type</span>
                  <div className="filter-pills">
                    <button
                      className={`filter-pill ${providerMode === 'gpu' ? 'selected' : ''}`}
                      onClick={() => switchProvider('gpu')}
                    >
                      Descriptive
                    </button>
                    <button
                      className={`filter-pill ${providerMode === 'stdb' ? 'selected' : ''}`}
                      onClick={() => switchProvider('stdb')}
                    >
                      Keyword
                    </button>
                  </div>
                </div>
              )}
              <div className="search-opt-section">
                <span className="search-opt-label">Show</span>
                <div className="filter-pills">
                  <label className={`filter-pill ${showIndividuals ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={showIndividuals}
                      onChange={(e) => { dropClaimable(); setShowIndividuals(e.target.checked); }}
                      style={{ display: 'none' }}
                    />
                    Individuals
                  </label>
                  <label className={`filter-pill ${showOrganizations ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={showOrganizations}
                      onChange={(e) => { dropClaimable(); setShowOrganizations(e.target.checked); }}
                      style={{ display: 'none' }}
                    />
                    Organizations
                  </label>
                </div>
              </div>
              <button
                className="search-opt"
                onClick={() => { setShowSearchOptions(false); setLocInput(''); setLocSuggestions([]); setShowLocModal(true); }}
              >
                📍 Search Location
                {searchLoc && <span className="search-opt-value">{searchLoc.label}</span>}
              </button>
              {searchLoc && (
                <button className="search-opt" onClick={() => { setSearchLoc(null); setShowSearchOptions(false); }}>
                  ✕ Clear search location
                </button>
              )}
              {activePos && (
                <button className="search-opt" onClick={() => setNearbyFirst(!nearbyFirst)}>
                  {nearbyFirst ? '✓ ' : ''}Nearby First
                </button>
              )}
              <div className="search-opt-section">
                <span className="search-opt-label">Gender</span>
                <div className="filter-pills">
                  {[['any', 'Any'], ['male', 'Male'], ['female', 'Female'], ['other', 'Other']].map(([v, label]) => (
                    <button
                      key={v}
                      className={`filter-pill ${genderFilter === v ? 'selected' : ''}`}
                      onClick={() => { if (v !== genderFilter) dropClaimable(); setGenderFilter(v); }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="search-opt-section">
                <span className="search-opt-label">Age</span>
                <div className="age-filter-row">
                  <input
                    type="number"
                    min={13}
                    max={120}
                    placeholder="Min"
                    value={ageMin}
                    onChange={(e) => { dropClaimable(); setAgeMin(e.target.value); }}
                    className="age-filter-input"
                  />
                  <span className="age-filter-sep">–</span>
                  <input
                    type="number"
                    min={13}
                    max={120}
                    placeholder="Max"
                    value={ageMax}
                    onChange={(e) => { dropClaimable(); setAgeMax(e.target.value); }}
                    className="age-filter-input"
                  />
                </div>
              </div>
            </div>
          )}
        </div>}
        right={<AuthActions />}
        absoluteCenter
      />

      <main className="search-content">
        <div className={`search-mode-header${mode === 'swipe' ? ' swipe-mode' : ''}`}>
          <div className="search-mode-left">
            <p className="results-count">{mode === 'swipe' && results.length > 0 ? `${swipeIndex + 1} / ${results.length}` : `${results.length} result${results.length !== 1 ? 's' : ''}`}</p>
            {activePos && (
              <button
                onClick={() => setNearbyFirst(!nearbyFirst)}
                className={`nearby-toggle ${nearbyFirst ? 'active' : ''}`}
              >
                {nearbyFirst ? '✓ Nearby First' : 'Nearby First'}
              </button>
            )}
          </div>
          <ProfileTabs
            tabs={[
              { key: 'list', label: 'List' },
              { key: 'swipe', label: 'Swipe' },
              { key: 'map', label: 'Map' },
            ]}
            active={mode}
            onChange={(k) => setMode(k as any)}
          />
        </div>

        {allowanceNotice && (
          <div className="allowance-notice">
            <p>{allowanceNotice}</p>
          </div>
        )}
        {isLoading ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : results.length === 0 ? (
          query ? (
            <div className="no-results">
              <p>No results found matching "{query}"</p>
            </div>
          ) : (
            <div className="no-results">
              <p>Enter a name, city, or email to search</p>
            </div>
          )
        ) : (
          <>
          {mode === 'list' && (
            <div className="results">
              {results.map((result) => {
                const isOwn = result.email === email;
                const linkTo = result.type === 'org' ? `/org/${result.orgId}` : `/profile/${result.identity}`;
                return (
                  <Link to={linkTo} key={result.type === 'org' ? `org-${result.orgId}` : result.identity} className="result-card">
                    {result.profilePicture ? (
                      <img src={result.profilePicture} alt={result.fullName} className="result-avatar" />
                    ) : (
                      <div className="result-avatar-placeholder" />
                    )}
                    <div className="result-info">
                      <h3 className="result-name">
                        {result.fullName}
                        {result.type === 'org' && <span className="result-type-badge">Organization</span>}
                        {isOwn && ' (You)'}
                      </h3>
                      {result.city && <p className="result-city">{result.city}</p>}
                      {result.description && <p className="result-desc">{result.description}</p>}
                      {result.distance !== undefined && (
                        <p className="result-distance">{formatMiles(result.distance)} away</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          {mode === 'map' && (
            <div className="map-section">
              <MapView
                results={results.filter(r => r.locationLat !== undefined && r.locationLng !== undefined).map(r => ({
                  type: r.type,
                  identity: r.identity,
                  orgId: r.orgId,
                  fullName: r.fullName,
                  profilePicture: r.profilePicture,
                  description: r.description,
                  city: r.city,
                  locationLat: r.locationLat!,
                  locationLng: r.locationLng!,
                }))}
                center={activePos ?? undefined}
                onResultClick={(r) => navigate(r.type === 'org' ? `/org/${r.orgId}` : `/profile/${r.identity}`)}
              />
            </div>
          )}
          {mode === 'swipe' && (
            <div className="swipe-section">
              <SwipeView
                results={swipeResults}
                myIdentity={myIdentity}
                activeOrgId={activeOrg?.id}
                isDesktop={isDesktop}
                onIndexChange={setSwipeIndex}
              />
            </div>
          )}
          </>
        )}
      </main>

      {showLocModal && (
        <div className="loc-search-overlay" onClick={() => setShowLocModal(false)}>
          <div className="loc-search-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Search location</h3>
            <p>Search and map distances will be measured from this place.</p>
            <div className="loc-search-typeahead">
              <input
                type="text"
                value={locInput}
                onChange={(e) => setLocInput(e.target.value)}
                onBlur={() => {
                  // Close the dropdown when the field is deselected (suggestions
                  // register on mousedown, which fires before blur)
                  setTimeout(() => setLocSuggestions([]), 150);
                }}
                placeholder="City or place (e.g. Tokyo)"
                autoFocus
              />
              {locSuggestions.length > 0 && (
                <ul className="loc-suggestions">
                  {locSuggestions.map((s) => (
                    <li
                      key={s.place_id}
                      onMouseDown={() => {
                        setSearchLoc({ label: s.display_name.split(',')[0], lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
                        setLocSuggestions([]);
                        setLocInput('');
                        setShowLocModal(false);
                      }}
                    >
                      <span className="loc-sug-name">{s.display_name.split(',')[0]}</span>
                      <span className="loc-sug-region">{s.display_name.split(',').slice(1, 4).join(',').trim()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="loc-search-actions">
              {searchLoc && (
                <button
                  className="loc-search-clear"
                  onClick={() => {
                    setSearchLoc(null);
                    setShowLocModal(false);
                  }}
                >
                  Clear
                </button>
              )}
              <button className="loc-search-cancel" onClick={() => setShowLocModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .allowance-notice { background: #fff8e1; border: 1px solid #fcd34d; border-radius: 10px; padding: 14px 18px; margin: 12px 16px; }
        .allowance-notice p { margin: 0; color: #92400e; font-size: 14px; line-height: 1.45; }
        .search-page {
          min-height: 100vh;
          background: #f5f5f5;
        }

        .search-content {
          max-width: var(--content-max-width);
          margin: 0 auto;
          padding: 6px 24px 24px;
        }

        .loading {
          display: flex;
          justify-content: center;
          padding: 48px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e0e0e0;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .no-results {
          text-align: center;
          padding: 48px 24px;
          background: white;
          border-radius: 12px;
        }

        .no-results p {
          color: #666;
          margin: 0;
        }

        .results-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; position: relative; z-index: 45; }
        .results-count { background: white; padding: 4px 12px; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.15); display: inline-block; }

        /* Mode selector (List | Map | Swipe) + tools — always visible above the fixed overlays */
        .search-mode-header {
          position: relative; z-index: 70; background: none;
          margin: -6px -24px 12px; padding: 4px 16px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
        }
        .search-mode-header .profile-tabs {
          position: absolute; left: 50%; transform: translateX(-50%);
          margin: 0; border-bottom: none; white-space: nowrap;
        }
        .search-mode-header .profile-tab { padding: 8px 16px; }
        .search-mode-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .search-mode-left .results-count { white-space: nowrap; background: none; box-shadow: none; padding: 0; color: #666; font-weight: 600; }
        .search-mode-right { display: flex; }
        .loc-search-btn { white-space: nowrap; }
        /* Higher specificity so the transparent fill actually beats .nearby-toggle's white */
        .search-mode-header .loc-search-btn { background: transparent; }

        .topbar-search-wrap { position: relative; }
        .search-options-menu {
          position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%);
          background: white; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
          padding: 6px; min-width: 286px; max-width: calc(100vw - 32px); z-index: 200;
          display: flex; flex-direction: column;
        }
        @media (min-width: 768px) {
          .search-options-menu { min-width: 286px; }
        }
        .search-opt {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 14px; background: none; border: none; border-radius: 8px;
          font-size: 14px; font-weight: 500; color: #333; cursor: pointer; text-align: left;
        }
        .search-opt:hover { background: #f3f4f6; }
        .search-opt-value { color: #667eea; font-size: 13px; font-weight: 600; }
        .search-suggestions {
          position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%);
          background: white; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
          width: min(420px, calc(100vw - 32px)); max-height: 220px; overflow-y: auto;
          z-index: 210; padding: 6px;
        }
        @media (max-width: 767px) {
          .search-suggestions { left: 0; right: 0; width: auto; transform: none; }
        }
        .search-suggestion { display: flex; align-items: center; gap: 2px; border-radius: 8px; }
        .search-suggestion:hover { background: #f3f4f6; }
        .suggestion-main {
          flex: 1; min-width: 0; text-align: left; background: none; border: none;
          padding: 9px 10px; font-size: 14px; color: #333; cursor: pointer;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .suggestion-star {
          background: none; border: none; color: #d1d5db; cursor: pointer;
          padding: 8px 10px; display: flex; align-items: center;
        }
        .suggestion-star:hover { color: #f59e0b; }
        .suggestion-star.active { color: #f59e0b; }
        .suggestion-x {
          background: none; border: none; color: #c4c8d0; cursor: pointer;
          padding: 8px 2px 8px 6px; font-size: 12px; visibility: hidden;
          display: flex; align-items: center;
        }
        .suggestion-x:hover { color: #dc2626; }
        @media (min-width: 768px) {
          .search-suggestion:hover .suggestion-x { visibility: visible; }
        }
        .search-opt-section { padding: 10px 14px 4px; }
        .search-opt-label { display: block; font-size: 12px; font-weight: 600; color: #999; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
        .filter-pills { display: flex; gap: 6px; flex-wrap: wrap; }
        .filter-pill {
          padding: 5px 12px; border: 1px solid #d1d5db; border-radius: 20px; cursor: pointer;
          font-size: 12px; font-weight: 600; color: #666; background: white;
        }
        .filter-pill.selected { background: #667eea; border-color: #667eea; color: white; }
        .age-filter-row { display: flex; align-items: center; gap: 8px; }
        .age-filter-input {
          width: 64px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 8px;
          font-size: 14px; outline: none;
        }
        .age-filter-input:focus { border-color: #667eea; }
        .age-filter-sep { color: #999; }

        /* Swipe mode: the header floats over profile photos — lighter text + shadow */
        .search-mode-header.swipe-mode .profile-tab { color: rgba(255,255,255,0.92); text-shadow: 0 1px 4px rgba(0,0,0,0.55); }
        .search-mode-header.swipe-mode .profile-tab.active { color: #fff; border-bottom-color: #fff; }
        .search-mode-header.swipe-mode .profile-tab:hover { color: #fff; }
        .search-mode-header.swipe-mode .results-count { color: rgba(255,255,255,0.85); text-shadow: 0 1px 4px rgba(0,0,0,0.55); }
        .search-mode-header.swipe-mode .nearby-toggle {
          color: rgba(255,255,255,0.92); background: transparent;
          border-color: rgba(255,255,255,0.6);
          text-shadow: 0 1px 4px rgba(0,0,0,0.55);
        }
        .search-mode-header.swipe-mode .nearby-toggle:hover { background: #667eea; color: #fff; }
        .search-mode-header.swipe-mode .nearby-toggle.active { background: #667eea; color: #fff; }
        @media (max-width: 767px) {
          .search-mode-header .profile-tabs {
            position: static; transform: none; width: 100%; justify-content: center;
            order: 3; margin-top: 2px;
          }
          .search-mode-left .results-count { display: none; }
        }

        /* Swipe mode: full-bleed from under the top bar; the mode header floats over it */
        .swipe-section { position: fixed; top: 60px; left: 0; right: 0; bottom: 0; z-index: 40; }

        /* Mobile: only the logo (left) and profile pic (right) — no chat/bell icons */
        @media (max-width: 767px) {
          .search-page .auth-actions .nav-icon-link:not(:last-child) { display: none; }
        }
        .results-tools { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .loc-search-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 24px; }
        .loc-search-modal { background: white; border-radius: 12px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        .loc-search-modal h3 { margin: 0 0 8px; color: #333; font-size: 16px; }
        .loc-search-modal p { margin: 0 0 12px; color: #666; font-size: 13px; line-height: 1.4; }
        .loc-search-modal input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; margin-bottom: 0; }
        .loc-search-typeahead { position: relative; margin-bottom: 14px; }
        .loc-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-top: none; border-radius: 0 0 8px 8px; list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; box-shadow: 0 6px 16px rgba(0,0,0,0.15); z-index: 10; }
        .loc-suggestions li { display: flex; flex-direction: column; padding: 8px 12px; cursor: pointer; }
        .loc-suggestions li:hover { background: #f5f7ff; }
        .loc-sug-name { font-size: 14px; font-weight: 600; color: #333; }
        .loc-sug-region { font-size: 12px; color: #888; }
        .loc-search-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .loc-search-clear { padding: 8px 14px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .loc-search-cancel { padding: 8px 14px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .loc-search-set { padding: 8px 14px; background: #667eea; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .loc-search-set:disabled { opacity: 0.6; }
        .map-section { position: fixed; top: 60px; left: 0; right: 0; bottom: 0; z-index: 40; }
        .map-section .map-view-wrap { height: 100%; border-radius: 0; box-shadow: none; }
        .map-section .map-view { height: 100%; }
        .map-section .leaflet-container { height: 100%; width: 100%; }
        .nearby-toggle { padding: 6px 14px; background: white; color: #667eea; border: 1px solid #667eea; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s, color 0.15s; }
        .nearby-toggle:hover { background: #667eea; color: white; }
        .nearby-toggle.active { background: #667eea; color: white; }
        .result-type-badge { margin-left: 8px; padding: 2px 8px; background: #eef2ff; color: #3730a3; border-radius: 10px; font-size: 11px; font-weight: 600; vertical-align: middle; }
        .result-distance { margin: 4px 0 0; color: #667eea; font-size: 13px; font-weight: 600; }
        .results-count {
          color: #666;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .result-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: white;
          border-radius: 12px;
          text-decoration: none;
          color: inherit;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .result-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .result-avatar {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .result-avatar-placeholder {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: #e0e0e0;
          flex-shrink: 0;
        }

        .result-info {
          flex: 1;
          min-width: 0;
        }

        .result-name {
          margin: 0 0 2px;
          font-size: 18px;
          font-weight: 700;
          color: #333;
        }

        .result-city {
          margin: 0 0 4px;
          font-size: 14px;
          color: #667eea;
          font-weight: 500;
        }

        .result-desc {
          margin: 0;
          font-size: 13px;
          color: #666;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .result-email {
          margin: 0;
          font-size: 13px;
          color: #999;
        }
      `}</style>
    </div>
  );
}

export default SearchPage;
