// clientData — THE merged client data layer (2026-08-31).
//
// One place for every "who is this / what is mine" answer. Previously this
// was split across the full-table subscription cache (buildAccountCache +
// sync table readers) and the three-tier preload store — now folded together:
//
//   MEMORY tier  — the preload store: search results (screen), last 10
//                  visited profiles, own profile pinned. Bounded LRUs.
//   VIEW tier    — per-subscriber my_* views (own rows only; profile
//                  snapshots are embedded in the rows — friends, story
//                  posters, request senders, ...). Sync reads.
//   FETCH tier   — on-demand RPC results for OTHER people's data (profile
//                  by identity, profile stories, friends, org members,
//                  gallery, org profile), memoized per key.
//
// Lookup priority everywhere: memory → view → fetch. No full-table
// subscription backs any of this anymore. The SpacetimeDB connection is
// INJECTED by spacetime.ts (setClientDb) — no import cycle.
/* eslint-disable @typescript-eslint/no-explicit-any */

let db: any = null;

export function setClientDb(conn: any): void {
  db = conn;
}

export function getClientDb(): any {
  return db;
}

export interface ProfileSnapshot {
  fullName: string;
  picture: string; // thumb (small-first)
  fullPicture?: string; // S3 URL / legacy — zoom + swipe
  city: string;
  description: string;
  gender?: string;
  age?: number;
  hideFriends?: boolean;
  createdAtMicros?: bigint | number;
  isPro?: boolean;
}

export interface OrgSnapshot {
  name: string;
  picture: string;
  fullPicture?: string;
  city: string;
  description: string;
  gender?: string;
  hideMembers?: boolean;
}

// ─── MEMORY tier (bounded LRUs) ─────────────────────────────────────────────
const SCREEN_CAP = 100;
const VISITED_CAP = 10;
const ORG_CAP = 50;

const screenProfiles = new Map<string, ProfileSnapshot>();
const screenOrder: string[] = [];
const visitedProfiles = new Map<string, ProfileSnapshot>();
const visitedOrder: string[] = [];
const orgSnapshots = new Map<string, OrgSnapshot>();
const orgOrder: string[] = [];
let ownSnapshot: { identityHex: string; snap: ProfileSnapshot } | null = null;
const fetchedProfiles = new Map<string, ProfileSnapshot>();
const fetchedFriends = new Map<string, Array<{ identity: string; fullName: string; picture: string; city: string }>>();
const fetchedOrgMembers = new Map<string, Array<{ identity: string; fullName: string; picture: string; city: string; role: string }>>();
const fetchedStories = new Map<string, any[]>();
const fetchedGallery = new Map<string, any[]>();
const fetchedOrgs = new Map<string, any>();

function lruPut<T>(map: Map<string, T>, order: string[], key: string, value: T, cap: number): void {
  if (map.has(key)) {
    map.set(key, value);
    const i = order.indexOf(key);
    if (i > 0) {
      order.splice(i, 1);
      order.unshift(key);
    }
    return;
  }
  map.set(key, value);
  order.unshift(key);
  if (order.length > cap) {
    const evicted = order.pop()!;
    map.delete(evicted);
  }
}

// Public preload APIs (same names as the old utils/profilePreload — the
// memory tier of the merged layer).
export function preloadProfile(identityHex: string, snap: ProfileSnapshot): void {
  if (!identityHex) return;
  lruPut(screenProfiles, screenOrder, identityHex, snap, SCREEN_CAP);
}

export function preloadVisitedProfile(identityHex: string, snap: ProfileSnapshot): void {
  if (!identityHex) return;
  lruPut(visitedProfiles, visitedOrder, identityHex, snap, VISITED_CAP);
}

export function preloadOwnProfile(identityHex: string, snap: ProfileSnapshot): void {
  if (!identityHex) return;
  ownSnapshot = { identityHex, snap };
}

export function preloadOrg(orgId: bigint, o: OrgSnapshot): void {
  lruPut(orgSnapshots, orgOrder, orgId.toString(), o, ORG_CAP);
}

// ─── VIEW tier (sync reads over the my_* views) ─────────────────────────────

export function getOwnProfileRow(): any | null {
  if (!db) return null;
  for (const row of db.db.my_own_profile.iter()) return row;
  return null;
}

// Profile snapshot resolution: memory → view (embedded snapshots) → fetched.
// Sync-only; returns undefined when nothing is known yet (callers fall back
// to RPC → ensureProfile).
export function getProfileSnapshot(identityHex: string): ProfileSnapshot | undefined {
  if (!identityHex) return undefined;
  if (!db) return undefined;
  const mem =
    visitedProfiles.get(identityHex) ??
    screenProfiles.get(identityHex) ??
    (ownSnapshot && ownSnapshot.identityHex === identityHex ? ownSnapshot.snap : undefined);
  if (mem) return mem;
  const fetched = fetchedProfiles.get(identityHex);
  if (fetched) return fetched;
  // View tier: snapshot columns embedded in my_* rows.
  for (const f of db.db.my_friendships.iter()) {
    if (f.friendIdentity.toHexString() === identityHex) {
      return { fullName: f.friendName, picture: f.friendPicture, city: f.friendCity, description: '' };
    }
  }
  for (const s of db.db.my_story.iter()) {
    if (s.posterIdentity.toHexString() === identityHex) {
      return { fullName: s.posterName, picture: s.posterPicture, city: '', description: '' };
    }
  }
  for (const p of db.db.my_posts.iter()) {
    if (p.profileOwnerIdentity.toHexString() === identityHex) {
      return { fullName: p.profileOwnerName, picture: p.profileOwnerPicture, city: '', description: '' };
    }
  }
  for (const r of db.db.my_friend_requests.iter()) {
    if (r.fromIdentity.toHexString() === identityHex) {
      return { fullName: r.fromName, picture: r.fromPicture, city: '', description: '' };
    }
  }
  const own = getOwnProfileRow();
  if (own && own.identity.toHexString() === identityHex) {
    return {
      fullName: own.fullName,
      picture: own.profilePictureSmall || own.profilePicture,
      fullPicture: own.profilePictureUrl || own.profilePicture,
      city: own.city,
      description: own.description,
      gender: own.gender,
      age: own.age,
      hideFriends: !!own.hideFriends,
      createdAtMicros: own.createdAtMicros,
      isPro: !!own.isPro,
    };
  }
  return undefined;
}

export function getOrgSnapshot(orgId: bigint): OrgSnapshot | undefined {
  if (!db) return undefined;
  const key = orgId.toString();
  const mem = orgSnapshots.get(key);
  if (mem) return mem;
  const fetched = fetchedOrgs.get(key);
  if (fetched) return { name: fetched.name, picture: fetched.pictureSmall || fetched.picture, fullPicture: fetched.pictureUrl || fetched.picture, city: fetched.city, description: fetched.description, gender: fetched.gender, hideMembers: fetched.hideMembers };
  for (const o of db.db.my_orgs.iter()) {
    if (o.orgId === orgId) {
      return { name: o.name, picture: o.pictureSmall || o.picture, fullPicture: o.pictureUrl || o.picture, city: o.city, description: o.description, gender: o.gender, hideMembers: !!o.hideMembers };
    }
  }
  return undefined;
}

// ─── Own-rows accessors (VIEW tier, sync) ───────────────────────────────────

export function getMyFriends(): Array<{ identity: string; name: string; picture: string; city: string }> {
  const out: Array<{ identity: string; name: string; picture: string; city: string }> = [];
  if (!db) return out;
  for (const f of db.db.my_friendships.iter()) {
    out.push({ identity: f.friendIdentity.toHexString(), name: f.friendName, picture: f.friendPicture, city: f.friendCity });
    // keep view-tier snapshot warm for instant profile paint
    lruPut(screenProfiles, screenOrder, f.friendIdentity.toHexString(), { fullName: f.friendName, picture: f.friendPicture, city: f.friendCity, description: '' }, SCREEN_CAP);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
// Alias used by spacetime.ts wrappers (keeps the old module's API names).
export const getMyFriendsList = getMyFriends;

export function getMyFollowingSet(): Set<string> {
  const out = new Set<string>();
  if (!db) return out;
  for (const f of db.db.my_following.iter()) out.add(f.followingIdentity.toHexString());
  return out;
}

export function getMyFriendRequests(): Array<{
  id: bigint;
  fromIdentity: string;
  toIdentity: string;
  status: string;
  createdAt: Date;
  fromName: string;
  fromPicture: string;
}> {
  const out: any[] = [];
  if (!db) return out;
  const me = getOwnProfileRow()?.identity.toHexString();
  for (const r of db.db.my_friend_requests.iter()) {
    out.push({
      id: r.id,
      fromIdentity: r.fromIdentity.toHexString(),
      toIdentity: r.toIdentity.toHexString(),
      status: r.status,
      createdAt: r.createdAt.toDate(),
      fromName: r.fromName,
      fromPicture: r.fromPicture,
    });
    lruPut(screenProfiles, screenOrder, r.fromIdentity.toHexString(), { fullName: r.fromName, picture: r.fromPicture, city: '', description: '' }, SCREEN_CAP);
  }
  if (me) out.sort((a, b) => (a.toIdentity === me ? -1 : b.toIdentity === me ? 1 : 0));
  return out;
}

export function getMyOrgRole(orgId: bigint): string | null {
  if (!db) return null;
  for (const o of db.db.my_orgs.iter()) if (o.orgId === orgId) return o.myRole;
  return null;
}

export function getMyOrgs(): Array<{
  id: bigint;
  name: string;
  picture: string;
  city: string;
  description: string;
  gender?: string;
  hideMembers: boolean;
  leaderIdentity: string;
  myRole: string;
}> {
  const out: any[] = [];
  if (!db) return out;
  for (const o of db.db.my_orgs.iter()) {
    out.push({
      id: o.orgId,
      name: o.name,
      picture: o.pictureSmall || o.picture,
      city: o.city,
      description: o.description,
      gender: o.gender,
      hideMembers: !!o.hideMembers,
      leaderIdentity: o.leaderIdentity.toHexString(),
      myRole: o.myRole,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
// Alias used by spacetime.ts wrappers.
export const getMyOrgsList = getMyOrgs;

export function getMyOrgMembers(): Array<{
  orgId: bigint;
  identity: string;
  fullName: string;
  picture: string;
  city: string;
  role: string;
}> {
  const out: any[] = [];
  if (!db) return out;
  for (const m of db.db.my_org_members.iter()) {
    out.push({
      orgId: m.orgId,
      identity: m.memberIdentity.toHexString(),
      fullName: m.memberName,
      picture: m.memberPicture,
      city: m.memberCity,
      role: m.role,
    });
    lruPut(screenProfiles, screenOrder, m.memberIdentity.toHexString(), { fullName: m.memberName, picture: m.memberPicture, city: m.memberCity, description: '' }, SCREEN_CAP);
  }
  return out;
}
// Alias used by spacetime.ts wrappers.
export const getMyOrgMembersList = getMyOrgMembers;

export function getMyOrgRequestStatus(orgId: bigint): string | null {
  if (!db) return null;
  for (const r of db.db.my_org_requests.iter()) if (r.orgId === orgId) return r.status;
  return null;
}

export interface MyStoryRowLike {
  id: bigint;
  posterIdentity: string;
  posterName: string;
  posterPicture: string;
  content: string;
  mediaData: string;
  mediaTypes: string;
  mediaUrl?: string;
  createdAt: Date;
  actingAsOrgId?: bigint;
  actingAsOrgName?: string;
  actingAsOrgPicture?: string;
}

export function getMyStories(): MyStoryRowLike[] {
  const out: any[] = [];
  if (!db) return out;
  for (const s of db.db.my_story.iter()) {
    out.push({
      id: s.id,
      posterIdentity: s.posterIdentity.toHexString(),
      posterName: s.posterName,
      posterPicture: s.posterPicture,
      content: s.content,
      mediaData: s.mediaData,
      mediaTypes: s.mediaTypes,
      mediaUrl: s.mediaUrl,
      createdAt: s.createdAt.toDate(),
      actingAsOrgId: s.actingAsOrgId,
      actingAsOrgName: s.actingAsOrgName,
      actingAsOrgPicture: s.actingAsOrgPicture,
    });
    lruPut(screenProfiles, screenOrder, s.posterIdentity.toHexString(), { fullName: s.posterName, picture: s.posterPicture, city: '', description: '' }, SCREEN_CAP);
  }
  return out;
}

export function getMyPosts(): Array<{
  id: bigint;
  profileOwnerIdentity: string;
  profileOwnerName: string;
  profileOwnerPicture: string;
  content: string;
  mediaData: string;
  mediaTypes: string;
  mediaUrl?: string;
  createdAt: Date;
}> {
  const out: any[] = [];
  if (!db) return out;
  for (const p of db.db.my_posts.iter()) {
    out.push({
      id: p.id,
      profileOwnerIdentity: p.profileOwnerIdentity.toHexString(),
      profileOwnerName: p.profileOwnerName,
      profileOwnerPicture: p.profileOwnerPicture,
      content: p.content,
      mediaData: p.mediaData,
      mediaTypes: p.mediaTypes,
      mediaUrl: p.mediaUrl,
      createdAt: p.createdAt.toDate(),
    });
    lruPut(screenProfiles, screenOrder, p.profileOwnerIdentity.toHexString(), { fullName: p.profileOwnerName, picture: p.profileOwnerPicture, city: '', description: '' }, SCREEN_CAP);
  }
  return out;
}
// Alias used by spacetime.ts wrappers.
export const getMyPostsList = getMyPosts;

export function getMyGallery(): Array<{ id: bigint; s3Key: string; url: string; bytes: bigint; createdAt: Date }> {
  const out: any[] = [];
  if (!db) return out;
  for (const g of db.db.my_gallery.iter()) {
    out.push({ id: g.id, s3Key: g.s3Key, url: g.url, bytes: g.bytes, createdAt: g.createdAt.toDate() });
  }
  return out;
}

export function getTodayPostCount(posterHex: string): number {
  const DAY_MICROS = 86_400_000_000;
  const todayStart = BigInt(Math.floor((Date.now() * 1000) / DAY_MICROS) * DAY_MICROS);
  let n = 0;
  if (!db) return n;
  for (const p of db.db.my_posts.iter()) {
    if (p.posterIdentity.toHexString() !== posterHex) continue;
    const micros = BigInt(Number(p.createdAt.microsSinceUnixEpoch) || 0);
    if (micros >= todayStart) n++;
  }
  return n;
}

// ─── FETCH tier (on-demand RPC for others' data, memoized) ──────────────────

// Resolve a profile snapshot, fetching by identity when unknown. Memoized:
// N notification senders = N RPCs once, ever.
export async function ensureProfile(identityHex: string): Promise<ProfileSnapshot | undefined> {
  const known = getProfileSnapshot(identityHex);
  if (known) return known;
  try {
    const { getProfileByIdentity } = await import('./spacetime');
    const row = await getProfileByIdentity(identityHex);
    if (!row) return undefined;
    const snap: ProfileSnapshot = {
      fullName: row.fullName,
      picture: row.profilePictureSmall || row.profilePicture,
      fullPicture: row.profilePictureUrl || row.profilePicture,
      city: row.city,
      description: row.description,
      gender: row.gender,
      age: row.age,
      hideFriends: row.hideFriends,
      createdAtMicros: row.createdAtMicros,
      isPro: row.isPro,
    };
    fetchedProfiles.set(identityHex, snap);
    return snap;
  } catch (e) {
    console.error('Error resolving profile', identityHex, e);
    return undefined;
  }
}

export async function fetchProfileStories(profileIdentityHex: string): Promise<any[]> {
  const cached = fetchedStories.get(profileIdentityHex);
  if (cached) return cached;
  const { callProfileStories } = await import('./spacetime');
  const stories = await callProfileStories(profileIdentityHex);
  fetchedStories.set(profileIdentityHex, stories);
  for (const s of stories) {
    if (s.posterIdentity) {
      lruPut(screenProfiles, screenOrder, s.posterIdentity, { fullName: s.posterName || 'Unknown', picture: s.posterPicture || '', city: '', description: '' }, SCREEN_CAP);
    }
  }
  return stories;
}

export async function fetchProfileFriends(identityHex: string): Promise<Array<{ identity: string; fullName: string; picture: string; city: string }>> {
  const cached = fetchedFriends.get(identityHex);
  if (cached) return cached;
  const { callProfileFriends } = await import('./spacetime');
  const friends = await callProfileFriends(identityHex);
  fetchedFriends.set(identityHex, friends);
  for (const f of friends) {
    lruPut(screenProfiles, screenOrder, f.identity, { fullName: f.fullName, picture: f.picture, city: f.city, description: '' }, SCREEN_CAP);
  }
  return friends;
}

export async function fetchOrgMembers(orgId: bigint): Promise<Array<{ identity: string; fullName: string; picture: string; city: string; role: string }>> {
  const cached = fetchedOrgMembers.get(orgId.toString());
  if (cached) return cached;
  const { callOrgMembers } = await import('./spacetime');
  const members = await callOrgMembers(orgId);
  fetchedOrgMembers.set(orgId.toString(), members);
  for (const m of members) {
    lruPut(screenProfiles, screenOrder, m.identity, { fullName: m.fullName, picture: m.picture, city: m.city, description: '' }, SCREEN_CAP);
  }
  return members;
}

export async function fetchProfileGallery(ownerIdentityHex: string): Promise<any[]> {
  const cached = fetchedGallery.get(ownerIdentityHex);
  if (cached) return cached;
  const { callProfileGallery } = await import('./spacetime');
  const photos = await callProfileGallery(ownerIdentityHex);
  fetchedGallery.set(ownerIdentityHex, photos);
  return photos;
}

export async function fetchOrgProfile(orgId: bigint): Promise<any> {
  const cached = fetchedOrgs.get(orgId.toString());
  if (cached) return cached;
  const { callOrgProfile } = await import('./spacetime');
  const org = await callOrgProfile(orgId);
  if (org) fetchedOrgs.set(orgId.toString(), org);
  return org;
}

// Invalidate fetched caches (row edits/deletes should re-fetch, e.g. after
// posting a story on someone's profile their stories change, or while a
// friends/members/gallery page is open and polling).
export function refreshFetchedStories(profileIdentityHex: string): void {
  fetchedStories.delete(profileIdentityHex);
}

export function refreshFetchedFriends(identityHex: string): void {
  fetchedFriends.delete(identityHex);
}

export function refreshFetchedGallery(ownerIdentityHex: string): void {
  fetchedGallery.delete(ownerIdentityHex);
}

export function refreshFetchedOrgMembers(orgId: bigint): void {
  fetchedOrgMembers.delete(orgId.toString());
}
