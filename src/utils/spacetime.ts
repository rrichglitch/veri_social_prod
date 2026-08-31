import { DbConnection, tables } from '../module_bindings';
import { Identity, Timestamp } from 'spacetimedb';
import { SPACETIMEDB_HOST, SPACETIMEDB_MODULE, IMAGES_RELAY_URL, DIDIT_RELAY_URL } from '../config';
import { getOAuthSession } from './oauthSession';

let dbConnection: DbConnection | null = null;
let subscriptionPromise: Promise<void> | null = null;
let currentToken: string | undefined = undefined;

// Matches backend Gmail normalization in profile_reducers.ts
export function sanitizeEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex === -1) {
    return normalized;
  }
  const localPart = normalized.substring(0, atIndex);
  const domain = normalized.substring(atIndex);
  const cleanedLocal = localPart.split('+')[0].replace(/\./g, '');
  return cleanedLocal + domain;
}

export async function connectToSpacetimeDB(_email: string, token?: string): Promise<DbConnection> {
  // If we have a connection with the same token, reuse it
  if (dbConnection && currentToken === token && subscriptionPromise) {
    await subscriptionPromise;
    return dbConnection;
  }

  // If we have a token connection but want anonymous, don't downgrade
  if (dbConnection && currentToken && !token) {
    return dbConnection;
  }

  const uri = `wss://${SPACETIMEDB_HOST}`;
  const isAnonymous = !token;

  console.log('Connecting to SpacetimeDB at:', uri, 'with database:', SPACETIMEDB_MODULE, isAnonymous ? 'anonymous' : 'with token');

  try {
    const builder = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(SPACETIMEDB_MODULE)
      .onConnect((_conn, id) => {
        console.log('Connected to SpacetimeDB with identity:', id.toHexString());
      })
      .onDisconnect(() => {
        console.log('Disconnected from SpacetimeDB');
        dbConnection = null;
        subscriptionPromise = null;
        currentToken = undefined;
      })
      .onConnectError((_ctx, err) => {
        console.error('Error connecting to SpacetimeDB:', err);
      });

    if (token) {
      builder.withToken(token);
      currentToken = token;
    } else {
      currentToken = undefined;
    }

    dbConnection = await builder.build();

    if (isAnonymous) {
      subscriptionPromise = subscribeAnonymous();
    } else {
      subscriptionPromise = subscribeToTables();
    }
    await subscriptionPromise;

    return dbConnection;
  } catch (e) {
    console.error('Failed to connect to SpacetimeDB:', e);
    dbConnection = null;
    subscriptionPromise = null;
    throw e;
  }
}

async function subscribeAnonymous(): Promise<void> {
  if (!dbConnection) return;
  
  console.log('Subscribing anonymously...');
  return new Promise((resolve, reject) => {
    try {
      dbConnection!.subscriptionBuilder()
        .onApplied(() => {
          console.log('Anonymous subscription applied');
          resolve();
        })
        .onError((ctx) => {
          console.error('Anonymous subscription error:', ctx.event);
          reject(new Error('Subscription failed'));
        })
        .subscribe([
          tables.user_profile,
        ]);
    } catch (e) {
      console.error('Anonymous subscription error:', e);
      reject(e);
    }
  });
}

async function subscribeToTables(): Promise<void> {
  if (!dbConnection) return;
  
  console.log('Subscribing to tables...');
  return new Promise((resolve, reject) => {
    try {
      dbConnection!.subscriptionBuilder()
        .onApplied(() => {
          console.log('Subscription applied');
          resolve();
        })
        .onError((ctx) => {
          console.error('Subscription error:', ctx.event);
          reject(new Error('Subscription failed'));
        })
        .subscribe([
          tables.user_profile,
          tables.following,
          tables.story_post,
          tables.my_feed,
          tables.friend_request,
          tables.friendship,
          tables.notification,
          tables.message,
          tables.organization,
          tables.organization_member,
          tables.gallery_photo,
          'SELECT * FROM my_search_results',
          'SELECT * FROM my_search_allowance',
          'SELECT * FROM my_pro_subscription',
          'SELECT * FROM my_org_claim_fee',
        ]);
    } catch (e) {
      console.error('Subscription error:', e);
      reject(e);
    }
  });
}

export function getDbConnection(): DbConnection | null {
  return dbConnection;
}

export function disconnectFromSpacetimeDB() {
  if (dbConnection) {
    dbConnection.disconnect();
    dbConnection = null;
    subscriptionPromise = null;
  }
}

export async function checkProfileExistsByEmail(email: string): Promise<boolean> {
  if (!dbConnection) {
    console.log('No connection, cannot check profile');
    return false;
  }
  try {
    const r = await dbConnection.procedures.getProfileByEmail({ email });
    return !!r?.found;
  } catch (e) {
    console.error('Error checking profile:', e);
    return false;
  }
}

// Shape-compatible shim over get_profile_by_email: callers expect a row-like
// object with camelCase fields and an identity with toHexString().
export interface ProfileLookupRow {
  identity: { toHexString: () => string };
  email: string;
  fullName: string;
  city: string;
  description: string;
  profilePicture: string;
  profilePictureSmall: string;
  profilePictureUrl: string;
  locationLat?: number;
  locationLng?: number;
  locationPrecision: string;
  gender?: string;
  age?: number;
  hideFriends: boolean;
  disabled?: boolean;
  createdAtMicros?: bigint;
  isPro: boolean;
}

function rowFromProcedure(r: any): ProfileLookupRow | null {
  if (!r?.found) return null;
  return {
    identity: { toHexString: () => r.identityHex || '' },
    email: r.email ?? '',
    fullName: r.fullName ?? '',
    city: r.city ?? '',
    description: r.description ?? '',
    profilePicture: r.profilePicture ?? '',
    profilePictureSmall: r.profilePictureSmall ?? '',
    profilePictureUrl: r.profilePictureUrl ?? '',
    locationLat: r.locationLat ?? undefined,
    locationLng: r.locationLng ?? undefined,
    locationPrecision: r.locationPrecision ?? 'off',
    gender: r.gender ?? undefined,
    age: r.age ?? undefined,
    hideFriends: !!r.hideFriends,
    disabled: !!r.disabled,
    createdAtMicros: r.createdAtMicros ?? undefined,
    isPro: !!r.isPro,
  };
}

// Sync read of the caller's own profile row from the local subscription
// cache — NO procedure RPC. Own pages (/me, /home) use this on mount so
// navigation renders instantly; the procedure path stays for other users'
// profiles and for post-payment polling.
export function getProfileRowByEmail(email: string): ProfileLookupRow | null {
  if (!dbConnection) {
    return null;
  }
  try {
    const se = sanitizeEmail(email);
    for (const p of dbConnection.db.user_profile.iter()) {
      if (p.email === se) {
        return {
          identity: { toHexString: () => p.identity.toHexString() },
          email: p.email,
          fullName: p.fullName,
          city: p.city,
          description: p.description,
          profilePicture: p.profilePicture || '',
          profilePictureSmall: (p as any).profilePictureSmall || '',
          profilePictureUrl: (p as any).profilePictureUrl || '',
          locationLat: p.locationLat ?? undefined,
          locationLng: p.locationLng ?? undefined,
          locationPrecision: p.locationPrecision,
          gender: p.gender ?? undefined,
          age: p.age ?? undefined,
          hideFriends: !!p.hideFriends,
          disabled: !!p.disabled,
          createdAtMicros: p.createdAt ? BigInt(p.createdAt.microsSinceUnixEpoch) : undefined,
          isPro: !!p.isPro,
        };
      }
    }
  } catch {
    // cache not ready — treat as not found
  }
  return null;
}

export async function getProfileByEmail(email: string): Promise<ProfileLookupRow | null> {
  if (!dbConnection) {
    return null;
  }
  try {
    const r = await dbConnection.procedures.getProfileByEmail({ email });
    return rowFromProcedure(r);
  } catch (e) {
    console.error('Error getting profile:', e);
    return null;
  }
}

export async function claimProfile(email: string): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.claimProfile({ email });
}

export async function updateProfile(
  profilePicture?: string,
  profilePictureSmall?: string,
  profilePictureUrl?: string,
  city?: string,
  description?: string,
  hideFriends?: boolean,
  gender?: string
): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  console.log('Updating profile:', { profilePicture, profilePictureSmall, profilePictureUrl, city, description, hideFriends, gender });
  // NOTE: birthday is intentionally NOT updateable — set once at registration.

  await dbConnection.reducers.updateProfile({
    profilePicture: profilePicture ?? undefined,
    profilePictureSmall: profilePictureSmall ?? undefined,
    profilePictureUrl: profilePictureUrl ?? undefined,
    city: city ?? undefined,
    description: description ?? undefined,
    hideFriends: hideFriends ?? undefined,
    gender: gender ?? undefined,
  });
}

// Self-service disable/enable: a disabled profile is excluded from searches
// (keyword + semantic) until the owner turns it back on from Settings.
export async function setProfileDisabled(disabled: boolean): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }
  await dbConnection.reducers.setProfileDisabled({ disabled });
}

// Permanently deletes an organization (leader only) along with its members,
// pending requests, chat messages, and org-tied stories/follows.
export async function deleteOrganization(orgId: bigint): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }
  await dbConnection.reducers.deleteOrganization({ orgId });
}

export async function initiateDiditVerification(
  email: string,
  profilePictureSmall: string,
  profilePictureUrl: string,
  city: string,
  description: string,
  turnstileToken: string
): Promise<string> {
  // Initiation now routes through the didit relay (https://auth.veri.social/didit)
  // — the module cannot see client IPs, so the REAL per-IP throttle (+
  // Turnstile verification) lives there. The relay calls back into
  // SpacetimeDB as this user for the pending row. Only the 10KB thumbnail +
  // the S3 URL travel this path — the full-size image was already uploaded
  // to the images relay. Returns the Didit verification URL, or throws with
  // the relay/module message.
  const token = getOAuthSession()?.stToken;
  if (!token) {
    throw new Error('Not signed in');
  }

  const resp = await fetch(`${DIDIT_RELAY_URL}/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      email,
      profile_picture_small: profilePictureSmall,
      profile_picture_url: profilePictureUrl,
      city,
      description,
      turnstile_token: turnstileToken,
    }),
  });

  let data: any = null;
  try {
    data = await resp.json();
  } catch { /* non-JSON error body */ }

  if (!resp.ok) {
    throw new Error(data?.error ?? `Verification failed (${resp.status}) — please try again`);
  }
  if (!data?.success || !data.url) {
    throw new Error(data?.error ?? 'Failed to start identity verification');
  }
  return data.url;
}

// Fetch the caller's pending-registration state. If they already have an
// APPROVED Didit verification (or an in-progress one), the register page can
// resume the flow instead of restarting from scratch.
export async function getPendingRegistration(): Promise<{
  hasPending: boolean;
  verified: boolean;
  legalName: string | null;
  email: string | null;
  city: string | null;
  description: string | null;
  profilePicture: string | null;
  profilePictureSmall: string | null;
  profilePictureUrl: string | null;
} | null> {
  if (!dbConnection) {
    throw new Error('Not connected to SpacetimeDB');
  }

  const result = await dbConnection.procedures.getPendingRegistration({});
  console.log('getPendingRegistration result:', result);

  if (!result.hasPending) return null;

  return {
    hasPending: result.hasPending,
    verified: result.verified,
    legalName: result.legalName ?? null,
    email: result.email ?? null,
    city: result.city ?? null,
    description: result.description ?? null,
    profilePicture: result.profilePicture ?? null,
    profilePictureSmall: result.profilePictureSmall ?? null,
    profilePictureUrl: result.profilePictureUrl ?? null,
  };
}

export async function checkDiditVerification(sessionId: string): Promise<{ fullName: string; selfieImage: string | null; status: string }> {
  if (!dbConnection) {
    throw new Error('Not connected to SpacetimeDB');
  }

  console.log('Calling checkDiditVerification for session:', sessionId);

  const result = await dbConnection.procedures.checkDiditVerification({
    sessionId,
  });

  console.log('checkDiditVerification result:', result);

  if (!result.success) {
    throw new Error(result.error ?? `Identity verification ${result.status ?? 'failed'}`);
  }

  if (!result.fullName) {
    throw new Error('Identity verified, but your name was not returned. Make sure your Didit workflow includes ID document verification.');
  }

  return { fullName: result.fullName, selfieImage: result.selfieImage ?? null, status: result.status ?? 'APPROVED' };
}

export async function createVerifiedProfile(
  sessionId: string,
  profilePictureSmall: string,
  profilePictureUrl: string,
  city: string,
  description: string,
  fullName: string,
  birthday?: string,
  gender?: string
): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpacetimeDB');
  }

  console.log('Calling createVerifiedProfile for session:', sessionId);

  const result = await dbConnection.procedures.createVerifiedProfile({
    sessionId,
    profilePicture: '',
    profilePictureSmall,
    profilePictureUrl,
    city,
    description,
    fullName,
    birthday: birthday ?? '',
    gender: gender ?? '',
  });

  console.log('createVerifiedProfile result:', result);

  if (!result.success) {
    throw new Error(result.error ?? 'Failed to create profile');
  }
}

export async function getProfileByIdentity(identity: string): Promise<ProfileLookupRow | null> {
  if (!dbConnection) {
    return null;
  }

  try {
    const r = await dbConnection.procedures.getProfileByIdentity({ identityHex: identity });
    return rowFromProcedure(r);
  } catch (e) {
    console.error('Error getting profile by identity:', e);
    return null;
  }
}

export async function checkIsFollowing(targetIdentity: string, currentIdentityHex: string): Promise<boolean> {
  if (!dbConnection || !currentIdentityHex) {
    return false;
  }

  try {
    for (const f of dbConnection.db.following.iter()) {
      if (f.followerIdentity.toHexString() === currentIdentityHex && 
          f.followingIdentity.toHexString() === targetIdentity) {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error('Error checking follow status:', e);
    return false;
  }
}

// Deterministic SpacetimeDB identity for an organization account (0x4f + orgId)
export function orgAccountIdentityHex(orgId: bigint): string {
  return '4f' + orgId.toString(16).padStart(62, '0');
}

// identity hex -> { name, picture } for BOTH individual profiles and org
// accounts. Bandwidth design: picture = the 10KB THUMBNAIL (everything that
// renders at avatar size); fullPicture = the S3 URL (or legacy base64) used
// ONLY by swipe backgrounds and the profile-pic zoom.
export function buildAccountCache(): Map<string, { name: string; picture: string; fullPicture?: string }> {
  const cache = new Map<string, { name: string; picture: string; fullPicture?: string }>();
  if (!dbConnection) return cache;
  for (const profile of dbConnection.db.user_profile.iter()) {
    cache.set(profile.identity.toHexString(), {
      name: profile.fullName,
      picture: (profile as any).profilePictureSmall || profile.profilePicture || '',
      fullPicture: (profile as any).profilePictureUrl || profile.profilePicture || '',
    });
  }
  for (const org of dbConnection.db.organization.iter()) {
    cache.set(orgAccountIdentityHex(org.id), {
      name: org.name,
      picture: (org as any).pictureSmall || org.picture || '',
      fullPicture: (org as any).pictureUrl || org.picture || '',
    });
  }
  return cache;
}

export async function followUser(targetIdentity: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  const identity = Identity.fromString(targetIdentity);
  await dbConnection.reducers.follow({
    targetIdentity: identity,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  });
}

export async function unfollowUser(targetIdentity: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  const identity = Identity.fromString(targetIdentity);
  await dbConnection.reducers.unfollow({
    targetIdentity: identity,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  });
}

export async function createStoryPost(
  profileOwnerIdentity: string,
  content: string,
  mediaData?: string,
  mediaTypes?: string[],
  actingAsOrgId?: bigint
): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  const identity = Identity.fromString(profileOwnerIdentity);
  await dbConnection.reducers.createStoryPost({
    profileOwnerIdentity: identity,
    content,
    mediaData,
    mediaTypes: mediaTypes ? JSON.stringify(mediaTypes) : undefined,
    actingAsOrgId: actingAsOrgId ?? undefined,
  });
}

// Local pre-check for the daily post budget (mirrors the backend gate so the
// user gets a friendly message instead of a 530). Counts the caller's story
// posts created since the start of the UTC day.
export function getTodayStoryPostCount(posterHex: string): number {
  const DAY_MICROS = 86_400_000_000;
  const todayStart = Math.floor((Date.now() * 1000) / DAY_MICROS) * DAY_MICROS;
  let n = 0;
  if (!dbConnection) return n;
  for (const s of dbConnection.db.story_post.iter()) {
    if (s.posterIdentity.toHexString() === posterHex && Number(s.createdAt) >= todayStart) n++;
  }
  return n;
}

export async function getStoriesForProfile(profileOwnerIdentity: string) {
  if (!dbConnection) {
    return [];
  }

  try {
    const stories: any[] = [];
    const posterIdentities = new Set<string>();
    
    for (const post of dbConnection.db.story_post.iter()) {
      if (post.profileOwnerIdentity.toHexString() === profileOwnerIdentity) {
        posterIdentities.add(post.posterIdentity.toHexString());
      }
    }
    
    const profileCache = buildAccountCache();
    
    for (const post of dbConnection.db.story_post.iter()) {
      if (post.profileOwnerIdentity.toHexString() === profileOwnerIdentity) {
        const posterHex = post.posterIdentity.toHexString();
        const poster = profileCache.get(posterHex);
        stories.push({
          id: post.id,
          content: post.content,
          mediaData: post.mediaData,
          mediaTypes: post.mediaTypes,
          createdAt: post.createdAt.toDate(),
          posterIdentity: posterHex,
          posterName: poster?.name || 'Unknown',
          posterPicture: poster?.picture || '',
        });
      }
    }
    return stories.sort((a, b) => {
      const aTime = a.createdAt as unknown as bigint;
      const bTime = b.createdAt as unknown as bigint;
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting stories:', e);
    return [];
  }
}

export async function getMyStoryPosts(currentIdentityHex: string) {
  if (!dbConnection) {
    return [];
  }

  try {
    const stories: any[] = [];
    
    const profileCache = buildAccountCache();
    
    for (const post of dbConnection.db.story_post.iter()) {
      if (post.profileOwnerIdentity.toHexString() === currentIdentityHex) {
        const posterHex = post.posterIdentity.toHexString();
        const poster = profileCache.get(posterHex);
        stories.push({
          id: post.id,
          content: post.content,
          mediaData: post.mediaData,
          mediaTypes: post.mediaTypes,
          createdAt: post.createdAt.toDate(),
          posterIdentity: posterHex,
          posterName: poster?.name || 'Unknown',
          posterPicture: poster?.picture || '',
          profileOwnerIdentity: currentIdentityHex,
        });
      }
    }
    return stories.sort((a, b) => {
      const aTime = a.createdAt as unknown as bigint;
      const bTime = b.createdAt as unknown as bigint;
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting my story posts:', e);
    return [];
  }
}

export async function getMyPosts(currentIdentityHex: string) {
  if (!dbConnection) {
    return [];
  }

  try {
    const posts: any[] = [];
    
    const profileCache = buildAccountCache();
    
    for (const post of dbConnection.db.story_post.iter()) {
      if (post.posterIdentity.toHexString() === currentIdentityHex) {
        const ownerHex = post.profileOwnerIdentity.toHexString();
        const owner = profileCache.get(ownerHex);
        posts.push({
          id: post.id,
          content: post.content,
          mediaData: post.mediaData,
          mediaTypes: post.mediaTypes,
          createdAt: post.createdAt.toDate(),
          profileOwnerIdentity: ownerHex,
          profileOwnerName: owner?.name || 'Unknown',
          profileOwnerPicture: owner?.picture || '',
        });
      }
    }
    return posts.sort((a, b) => {
      const aTime = a.createdAt as unknown as bigint;
      const bTime = b.createdAt as unknown as bigint;
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting my posts:', e);
    return [];
  }
}

export async function deleteStoryPost(postId: bigint): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await dbConnection.reducers.deleteStoryPost({
    postId,
  });
}

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const PAGE_SIZE = 20;

export interface FeedStory {
  id: bigint;
  profileOwnerIdentity: any;
  posterIdentity: any;
  content: string;
  mediaData: string;
  mediaTypes: string;
  createdAt: Date;
  posterName: string;
  posterPicture: string;
  profileOwnerIdentityHex: string;
  profileOwnerName: string;
  profileOwnerPicture: string;
}

export async function refreshFeed(): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await dbConnection.reducers.refreshFeed({});
}

export async function updateFeedScrollPosition(lastReadAt: Date): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await dbConnection.reducers.updateFeedScrollPosition({
    lastReadAt: Timestamp.fromDate(lastReadAt),
  });
}

export function getMyFeedStories(orderOldToNew: boolean = true): FeedStory[] {
  if (!dbConnection) {
    return [];
  }

  try {
    const stories: FeedStory[] = [];
    for (const row of dbConnection.db.my_feed.iter()) {
      stories.push({
        id: row.id,
        profileOwnerIdentity: row.profileOwnerIdentity,
        posterIdentity: row.posterIdentity,
        content: row.content,
        mediaData: row.mediaData,
        mediaTypes: row.mediaTypes,
        createdAt: row.createdAt.toDate(),
        posterName: row.posterName,
        posterPicture: row.posterPicture,
        profileOwnerIdentityHex: row.profileOwnerIdentity.toHexString(),
        profileOwnerName: row.profileOwnerName,
        profileOwnerPicture: row.profileOwnerPicture,
      });
    }

    return stories.sort((a, b) => {
      const aTime = a.createdAt.getTime();
      const bTime = b.createdAt.getTime();
      if (orderOldToNew) {
        return aTime > bTime ? 1 : aTime < bTime ? -1 : 0;
      }
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting feed stories:', e);
    return [];
  }
}

// Feed for an organization account: posts on profiles the org follows + posts on the org's own story
export function getOrgFeedStories(orgIdentity: string, orderOldToNew: boolean = true): FeedStory[] {
  if (!dbConnection) return [];
  try {
    const followingSet = new Set<string>();
    for (const f of dbConnection.db.following.iter()) {
      if (f.followerIdentity.toHexString() === orgIdentity) {
        followingSet.add(f.followingIdentity.toHexString());
      }
    }
    const accounts = buildAccountCache();
    const orgCache = new Map<bigint, { name: string; picture: string }>();
    for (const o of dbConnection.db.organization.iter()) {
      orgCache.set(o.id, { name: o.name, picture: (o as any).pictureSmall || o.picture || '' });
    }
    const stories: FeedStory[] = [];
    for (const post of dbConnection.db.story_post.iter()) {
      const ownerHex = post.profileOwnerIdentity.toHexString();
      // feed = posts on followed profiles + the org's own story
      if (!followingSet.has(ownerHex) && ownerHex !== orgIdentity) continue;
      if (post.posterIdentity.toHexString() === ownerHex) continue;
      // Poster display: posts made by an org show the org
      let posterName = 'Unknown';
      let posterPicture = '';
      if (post.actingAsOrgId !== undefined) {
        const o = orgCache.get(post.actingAsOrgId);
        if (o) { posterName = o.name; posterPicture = o.picture; }
      } else {
        const poster = accounts.get(post.posterIdentity.toHexString());
        if (poster) { posterName = poster.name; posterPicture = poster.picture; }
      }
      const owner = accounts.get(ownerHex);
      stories.push({
        id: post.id,
        profileOwnerIdentity: post.profileOwnerIdentity,
        posterIdentity: post.posterIdentity,
        content: post.content,
        mediaData: post.mediaData,
        mediaTypes: post.mediaTypes,
        createdAt: post.createdAt.toDate(),
        posterName,
        posterPicture,
        profileOwnerIdentityHex: ownerHex,
        profileOwnerName: owner?.name || 'Unknown',
        profileOwnerPicture: owner?.picture || '',
      });
    }
    return stories.sort((a, b) => {
      const aTime = a.createdAt.getTime();
      const bTime = b.createdAt.getTime();
      if (orderOldToNew) return aTime > bTime ? 1 : aTime < bTime ? -1 : 0;
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting org feed stories:', e);
    return [];
  }
}

export function getPaginatedOrgFeedStories(
  orgIdentity: string,
  orderOldToNew: boolean = true,
  page: number = 0,
  perPage: number = PAGE_SIZE
): { stories: FeedStory[]; hasMore: boolean } {
  const allStories = getOrgFeedStories(orgIdentity, orderOldToNew);
  const start = page * perPage;
  const end = start + perPage;
  return {
    stories: allStories.slice(start, end),
    hasMore: end < allStories.length,
  };
}

export function getPaginatedFeedStories(
  orderOldToNew: boolean = true,
  page: number = 0,
  perPage: number = PAGE_SIZE
): { stories: FeedStory[]; hasMore: boolean } {
  const allStories = getMyFeedStories(orderOldToNew);
  const start = page * perPage;
  const end = start + perPage;
  return {
    stories: allStories.slice(start, end),
    hasMore: end < allStories.length,
  };
}

export async function getFeedPosition(_currentIdentityHex: string): Promise<Date | null> {
  if (!dbConnection) return null;
  // feed_position is a private table, not available client-side
  return null;
}

export async function setFeedPosition(_currentIdentityHex: string, lastReadAt: Date): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await dbConnection.reducers.updateFeedScrollPosition({
    lastReadAt: Timestamp.fromDate(lastReadAt),
  });
}

export async function getFollowedStoriesWithOptions(
  currentIdentityHex: string,
  orderOldToNew: boolean,
  startFromTimestamp?: Date
) {
  if (!dbConnection) {
    return [];
  }

  const cutoffDate = new Date(Date.now() - TWO_YEARS_MS);

  try {
    const followedIdentities: string[] = [];
    for (const f of dbConnection.db.following.iter()) {
      if (f.followerIdentity.toHexString() === currentIdentityHex) {
        followedIdentities.push(f.followingIdentity.toHexString());
      }
    }

    if (followedIdentities.length === 0) {
      return [];
    }

    const profileCache = buildAccountCache();

    const stories: any[] = [];
    for (const post of dbConnection.db.story_post.iter()) {
      const profileOwnerHex = post.profileOwnerIdentity.toHexString();
      const posterHex = post.posterIdentity.toHexString();
      const postDate = post.createdAt.toDate();
      
      if (followedIdentities.includes(profileOwnerHex) && posterHex !== profileOwnerHex) {
        if (postDate < cutoffDate) {
          continue;
        }
        if (startFromTimestamp) {
          if (orderOldToNew && postDate < startFromTimestamp) {
            continue;
          }
          if (!orderOldToNew && postDate > startFromTimestamp) {
            continue;
          }
        }
        const poster = profileCache.get(posterHex);
        const profileOwner = profileCache.get(profileOwnerHex);
        stories.push({
          id: post.id,
          content: post.content,
          mediaData: post.mediaData,
          mediaTypes: post.mediaTypes,
          createdAt: postDate,
          posterIdentity: posterHex,
          posterName: poster?.name || 'Unknown',
          posterPicture: poster?.picture || '',
          profileOwnerIdentity: profileOwnerHex,
          profileOwnerName: profileOwner?.name || 'Unknown',
          profileOwnerPicture: profileOwner?.picture || '',
        });
      }
    }

    return stories.sort((a, b) => {
      const aTime = a.createdAt as unknown as bigint;
      const bTime = b.createdAt as unknown as bigint;
      if (orderOldToNew) {
        return aTime > bTime ? 1 : aTime < bTime ? -1 : 0;
      }
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting followed stories:', e);
    return [];
  }
}

export async function getFollowedStories(currentIdentityHex: string) {
  return getFollowedStoriesWithOptions(currentIdentityHex, false);
}

// ─── Organization APIs ───────────────────────────────────────────

// Location is mandatory for org creation: caller passes the geolocation fix
// (jittered client-side when approx) + the city derived from it + precision.
export async function createOrganization(
  name: string, picture: string, city: string, description: string,
  locationLat: number, locationLng: number, locationPrecision: 'exact' | 'approx' = 'exact',
  pictureSmall?: string, pictureUrl?: string,
): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.createOrganization({
    name, picture, city, description,
    locationLat,
    locationLng,
    locationPrecision,
    pictureSmall: pictureSmall ?? undefined,
    pictureUrl: pictureUrl ?? undefined,
  });
}

export async function updateOrganization(
  orgId: bigint, picture?: string, pictureSmall?: string, pictureUrl?: string,
  city?: string, description?: string, locationLat?: number, locationLng?: number,
  hideMembers?: boolean, gender?: string
): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.updateOrganization({
    orgId, picture: picture ?? undefined, pictureSmall: pictureSmall ?? undefined,
    pictureUrl: pictureUrl ?? undefined, city: city ?? undefined, description: description ?? undefined,
    locationLat: locationLat ?? undefined,
    locationLng: locationLng ?? undefined,
    hideMembers: hideMembers ?? undefined,
    gender: gender ?? undefined,
  });
}

export function getMyOrganizations(identity: string) {
  if (!dbConnection) return [];
  const orgs: any[] = [];
  const orgCache = new Map<bigint, any>();
  for (const org of dbConnection.db.organization.iter()) {
    orgCache.set(org.id, org);
  }
  // organization_member is ROLES ONLY (leader/co-leader) — membership is a
  // friendship row with the org's account identity. Role rows still imply
  // membership (a leader/co-leader is by definition a member).
  const seen = new Set<string>();
  for (const f of dbConnection.db.friendship.iter()) {
    const a = f.userA.toHexString();
    const b = f.userB.toHexString();
    const other = a === identity ? b : b === identity ? a : null;
    if (!other) continue;
    if (!(other.length === 64 && other.startsWith('4f'))) continue;
    const orgId = BigInt('0x' + other.slice(2));
    const org = orgCache.get(orgId);
    if (!org || seen.has(other)) continue;
    seen.add(other);
    orgs.push({ ...org, picture: (org as any).pictureSmall || org.picture || '', role: getOrgRole(orgId, identity) });
  }
  // Role rows: orgs where I'm leader/co-leader but not (yet) a friend (should
  // not normally happen — role rows are created through membership).
  for (const m of dbConnection.db.organization_member.iter()) {
    if (m.memberIdentity.toHexString() === identity) {
      const org = orgCache.get(m.orgId);
      const orgHex = orgAccountIdentityHex(m.orgId);
      if (org && !seen.has(orgHex)) {
        seen.add(orgHex);
        orgs.push({ ...org, picture: (org as any).pictureSmall || org.picture || '', role: m.role });
      }
    }
  }
  return orgs;
}

// Roles live in organization_member (leader/co-leader); a plain member has no
// row there, so the default role is 'member'.
function getOrgRole(orgId: bigint, identity: string): string {
  if (!dbConnection) return 'member';
  for (const m of dbConnection.db.organization_member.iter()) {
    if (m.orgId === orgId && m.memberIdentity.toHexString() === identity) {
      if (m.role === 'leader' || m.role === 'co_leader') return m.role;
    }
  }
  return 'member';
}

export function getOrganizationById(orgId: bigint) {
  if (!dbConnection) return null;
  for (const org of dbConnection.db.organization.iter()) {
    if (org.id === orgId) return org;
  }
  return null;
}

export function getOrganizationMembers(orgId: bigint) {
  if (!dbConnection) return [];
  const members: any[] = [];
  const profileCache = buildAccountCache();
  const cities = new Map<string, string>();
  for (const p of dbConnection.db.user_profile.iter()) {
    cities.set(p.identity.toHexString(), p.city || '');
  }
  // Members ARE friends of the org's account identity: iterate FRIENDSHIP,
  // not organization_member (that table is ROLES ONLY). Role overlay for
  // leader/co-leader comes from organization_member rows.
  const orgHex = orgAccountIdentityHex(orgId);
  const seen = new Set<string>();
  for (const f of dbConnection.db.friendship.iter()) {
    const a = f.userA.toHexString();
    const b = f.userB.toHexString();
    const other = a === orgHex ? b : b === orgHex ? a : null;
    if (!other) continue;
    if (seen.has(other)) continue;
    seen.add(other);
    const profile = profileCache.get(other);
    members.push({
      identity: other,
      role: getOrgRole(orgId, other),
      fullName: profile?.name || 'Unknown',
      picture: profile?.picture || '',
      city: cities.get(other) || '',
      joinedAt: f.createdAt?.toDate() ?? new Date(),
    });
  }
  // Role rows imply membership — include any leader/co-leader not already in
  // the friendship list (legacy orgs created before membership became
  // friendship may only have the role row).
  for (const m of dbConnection.db.organization_member.iter()) {
    if (m.orgId === orgId && (m.role === 'leader' || m.role === 'co_leader')) {
      const hex = m.memberIdentity.toHexString();
      if (seen.has(hex)) continue;
      seen.add(hex);
      const profile = profileCache.get(hex);
      members.push({
        identity: hex,
        role: m.role,
        fullName: profile?.name || 'Unknown',
        picture: profile?.picture || '',
        city: cities.get(hex) || '',
        joinedAt: m.joinedAt?.toDate() ?? new Date(),
      });
    }
  }
  return members;
}

export async function acceptOrgMember(requestId: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.acceptOrgMember({ requestId });
}

export async function declineOrgMember(requestId: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.declineOrgMember({ requestId });
}

export async function promoteToCoLeader(orgId: bigint, memberIdentity: string): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.promoteToCoLeader({
    orgId,
    memberIdentity: Identity.fromString(memberIdentity),
  });
}

export async function demoteCoLeader(orgId: bigint, memberIdentity: string): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.demoteCoLeader({
    orgId,
    memberIdentity: Identity.fromString(memberIdentity),
  });
}

export async function transferLeadership(orgId: bigint, newLeaderIdentity: string): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.transferLeadership({
    orgId,
    newLeaderIdentity: Identity.fromString(newLeaderIdentity),
  });
}

export async function removeOrgMember(orgId: bigint, memberIdentity: string): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.removeOrgMember({
    orgId,
    memberIdentity: Identity.fromString(memberIdentity),
  });
}

// ─── Friend Request APIs ──────────────────────────────────────────

export async function sendFriendRequest(toIdentity: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.sendFriendRequest({
    toIdentity: Identity.fromString(toIdentity),
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  });
}

export async function acceptFriendRequest(requestId: bigint, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.acceptFriendRequest({
    requestId,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  });
}

export async function declineFriendRequest(requestId: bigint, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.declineFriendRequest({
    requestId,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  });
}

export async function cancelFriendRequest(toIdentity: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.cancelFriendRequest({
    toIdentity: Identity.fromString(toIdentity),
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  });
}

export async function unfriend(targetIdentity: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.unfriend({
    targetIdentity: Identity.fromString(targetIdentity),
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  });
}

export function checkIsFriend(currentIdentityHex: string, otherIdentity: string): boolean {
  if (!dbConnection) return false;
  for (const f of dbConnection.db.friendship.iter()) {
    const a = f.userA.toHexString();
    const b = f.userB.toHexString();
    if ((a === currentIdentityHex && b === otherIdentity) || 
        (a === otherIdentity && b === currentIdentityHex)) {
      return true;
    }
  }
  return false;
}

export function getFriendRequestStatus(fromIdentity: string, toIdentity: string): string | null {
  if (!dbConnection) return null;
  for (const r of dbConnection.db.friend_request.iter()) {
    if (r.fromIdentity.toHexString() === fromIdentity && 
        r.toIdentity.toHexString() === toIdentity) {
      return r.status === 'pending' ? 'pending' : null;
    }
  }
  return null;
}

export function getOrgMemberRequestStatus(orgId: bigint, fromIdentity: string): string | null {
  if (!dbConnection) return null;
  for (const r of dbConnection.db.org_member_request.iter()) {
    if (r.orgId === orgId && r.fromIdentity.toHexString() === fromIdentity) {
      return r.status;
    }
  }
  return null;
}

export async function sendOrgMemberRequest(orgId: bigint, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.sendOrgMemberRequest({
    orgId,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  });
}

// Leave an organization = UNFRIEND the org's account identity (membership ≡
// friendship; the unfriend reducer drops the member row + pending request
// when the target is an org identity). Follows of the org are unaffected.
export async function leaveOrg(orgId: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await unfriend(orgAccountIdentityHex(orgId));
}

// ─── Messaging APIs ───────────────────────────────────────────────

export async function sendDirectMessage(recipientIdentity: string, content: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.sendDirectMessage({
    recipientIdentity: Identity.fromString(recipientIdentity),
    content,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  });
}

export async function sendOrgMessage(orgId: bigint, content: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.sendOrgMessage({ orgId, content, actingAsOrgId: actingAsOrgId ?? undefined });
}

export function getDirectMessages(userA: string, userB: string) {
  if (!dbConnection) return [];
  const msgs: any[] = [];
  for (const m of dbConnection.db.message.iter()) {
    const sender = m.senderIdentity.toHexString();
    const recipient = m.recipientIdentity?.toHexString() || '';
    if ((sender === userA && recipient === userB) || (sender === userB && recipient === userA)) {
      msgs.push({
        id: m.id,
        senderIdentity: sender,
        content: m.content,
        createdAt: m.createdAt.toDate(),
      });
    }
  }
  return msgs.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function getOrgMessages(orgId: bigint) {
  if (!dbConnection) return [];
  const msgs: any[] = [];
  const profileCache = buildAccountCache();
  for (const m of dbConnection.db.message.iter()) {
    if (m.orgId === orgId) {
      const senderHex = m.senderIdentity.toHexString();
      const profile = profileCache.get(senderHex);
      msgs.push({
        id: m.id,
        senderIdentity: senderHex,
        senderName: profile?.name || 'Unknown',
        senderPicture: profile?.picture || '',
        content: m.content,
        createdAt: m.createdAt.toDate(),
      });
    }
  }
  return msgs.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// All friends of an identity (both directions of the friendship table)
export function getFriends(identity: string): { identity: string; name: string; picture: string; city: string }[] {
  if (!dbConnection) return [];
  const friendIds = new Set<string>();
  for (const f of dbConnection.db.friendship.iter()) {
    const a = f.userA.toHexString();
    const b = f.userB.toHexString();
    if (a === identity) friendIds.add(b);
    else if (b === identity) friendIds.add(a);
  }
  const cache = buildAccountCache();
  const cities = new Map<string, string>();
  for (const p of dbConnection.db.user_profile.iter()) {
    cities.set(p.identity.toHexString(), p.city || '');
  }
  const out: { identity: string; name: string; picture: string; city: string }[] = [];
  for (const id of friendIds) {
    const acc = cache.get(id);
    out.push({ identity: id, name: acc?.name || 'Unknown', picture: acc?.picture || '', city: cities.get(id) || '' });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function getFriendChats(identity: string) {
  if (!dbConnection) return [];
  const friends = new Set<string>();
  for (const f of dbConnection.db.friendship.iter()) {
    const a = f.userA.toHexString();
    const b = f.userB.toHexString();
    if (a === identity) friends.add(b);
    else if (b === identity) friends.add(a);
  }
  const profileCache = buildAccountCache();
  // Find latest message for each friend
  const latestMsg = new Map<string, number>();
  for (const m of dbConnection.db.message.iter()) {
    const s = m.senderIdentity.toHexString();
    const r = m.recipientIdentity?.toHexString();
    if (!r) continue;
    const friendId = s === identity ? r : r === identity ? s : null;
    if (friendId && friends.has(friendId)) {
      const existing = latestMsg.get(friendId);
      const ts = Number(m.createdAt);
      if (existing === undefined || ts > existing) {
        latestMsg.set(friendId, ts);
      }
    }
  }
  return Array.from(friends)
    .map(fid => {
      const profile = profileCache.get(fid);
      return {
        identity: fid,
        fullName: profile?.name || 'Unknown',
        picture: profile?.picture || '',
        lastMsgAt: latestMsg.get(fid) || 0,
      };
    })
    .sort((a, b) => Number(b.lastMsgAt) - Number(a.lastMsgAt));
}

// ─── Notification APIs ────────────────────────────────────────────

export function getNotifications(identity: string) {
  if (!dbConnection) return [];
  const notifs: any[] = [];
  const profileCache = buildAccountCache();
  for (const n of dbConnection.db.notification.iter()) {
    if (n.recipientIdentity.toHexString() === identity) {
      const fromHex = n.fromIdentity?.toHexString();
      const fromProfile = fromHex ? profileCache.get(fromHex) : null;
      notifs.push({
        id: n.id,
        type: n.type,
        fromIdentity: fromHex,
        fromName: fromProfile?.name || 'Someone',
        fromPicture: fromProfile?.picture || '',
        orgId: n.orgId,
        message: n.message,
        createdAt: n.createdAt.toDate(),
        resolved: n.resolved,
        referenceId: n.referenceId,
      });
    }
  }
  return notifs.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function getUnreadNotificationCount(identity: string): number {
  if (!dbConnection) return 0;
  let count = 0;
  for (const n of dbConnection.db.notification.iter()) {
    if (n.recipientIdentity.toHexString() === identity && !n.resolved) {
      count++;
    }
  }
  return count;
}

export async function updateLocation(lat: number, lng: number, precision: 'off' | 'approx' | 'exact'): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.updateLocation({ lat, lng, precision });
}

// Downgrade to approximate: backend jitters the last stored precise location (no new fetch)
export async function jitterToApprox(): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.jitterToApprox({});
}

export async function updateOrgLocation(
  orgId: bigint, lat: number, lng: number, precision: 'off' | 'approx' | 'exact'
): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.updateOrgLocation({ orgId, lat, lng, precision });
}

export async function jitterOrgToApprox(orgId: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.jitterOrgToApprox({ orgId });
}

export async function resolveNotification(notificationId: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.resolveNotification({ notificationId });
}

// ─── Pro Upgrade ──────────────────────────────────────────────────

export async function upgradeToPro(): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.upgradeToPro({});
}

export async function cancelProSubscription(): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await dbConnection.reducers.cancelProSubscription({});
}

export function isPro(identity: string): boolean {
  if (!dbConnection) return false;
  const p = dbConnection.db.user_profile.identity.find(Identity.fromString(identity));
  return p?.isPro ?? false;
}

// One-time org claim fee rows for the current caller (my_org_claim_fee view).
export function getMyOrgClaimFee(): any[] {
  if (!dbConnection) return [];
  try {
    const rows: any[] = [];
    for (const r of (dbConnection as any).db.myOrgClaimFee.iter()) rows.push(r);
    return rows;
  } catch {
    return [];
  }
}

// ─── Gallery (S3-backed photos) ───────────────────────────────────

export interface GalleryPhoto {
  id: bigint;
  ownerIdentity: string;
  s3Key: string;
  url: string;
  bytes: number;
  createdAt: Date;
}

// All gallery photos for an identity, oldest first.
export function getGallery(ownerIdentity: string): GalleryPhoto[] {
  if (!dbConnection) return [];
  const photos: GalleryPhoto[] = [];
  for (const g of dbConnection.db.gallery_photo.iter()) {
    if (g.ownerIdentity.toHexString() === ownerIdentity) {
      photos.push({
        id: g.id,
        ownerIdentity: g.ownerIdentity.toHexString(),
        s3Key: g.s3Key,
        url: g.url,
        bytes: Number(g.bytes),
        createdAt: g.createdAt.toDate(),
      });
    }
  }
  return photos.sort((a, b) => (a.createdAt.getTime() - b.createdAt.getTime()));
}

// Upload a compressed WebP blob to the images relay. The relay stores it in
// S3 AND records the gallery row in SpacetimeDB using the caller's identity
// token (the upload itself is the auth). Returns the relay's {key, url}.
export async function uploadGalleryPhoto(
  blob: Blob,
  actingAsOrgId?: bigint,
  actingAsOrgIdentityHex?: string,
): Promise<{ key: string; url: string; bytes: number }> {
  const token = getOAuthSession()?.stToken;
  if (!token) throw new Error('Not signed in');
  const headers: Record<string, string> = {
    'Content-Type': blob.type || 'image/webp',
    Authorization: `Bearer ${token}`,
  };
  if (actingAsOrgId !== undefined && actingAsOrgIdentityHex) {
    headers['X-Acting-Org-Id'] = actingAsOrgId.toString();
    headers['X-Acting-Org-Identity'] = actingAsOrgIdentityHex;
  }
  const resp = await fetch(`${IMAGES_RELAY_URL}/upload`, {
    method: 'POST',
    headers,
    body: blob,
  });
  const text = await resp.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  if (!resp.ok) {
    throw new Error(data?.error || `Upload failed (${resp.status})`);
  }
  return { key: data.key, url: data.url, bytes: data.bytes };
}

// Upload the full-size (≤0.5MB) profile picture to S3 via the images relay.
// Returns the immutable URL; the DB only ever stores this URL + the 10KB
// thumbnail (bandwidth design — the full image is fetched on demand for
// swipe backgrounds and profile-pic zoom only).
export async function uploadProfilePicture(
  blob: Blob,
  actingAsOrgId?: bigint,
  actingAsOrgIdentityHex?: string,
): Promise<{ url: string }> {
  const token = getOAuthSession()?.stToken;
  if (!token) throw new Error('Not signed in');
  const headers: Record<string, string> = {
    'Content-Type': blob.type || 'image/webp',
    Authorization: `Bearer ${token}`,
  };
  if (actingAsOrgId !== undefined && actingAsOrgIdentityHex) {
    headers['X-Acting-Org-Id'] = actingAsOrgId.toString();
    headers['X-Acting-Org-Identity'] = actingAsOrgIdentityHex;
  }
  const resp = await fetch(`${IMAGES_RELAY_URL}/profile-upload`, {
    method: 'POST',
    headers,
    body: blob,
  });
  const text = await resp.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  if (!resp.ok) {
    throw new Error(data?.error || `Picture upload failed (${resp.status})`);
  }
  if (!data?.url) {
    throw new Error('Picture upload failed — no URL returned');
  }
  return { url: data.url };
}

// Delete a gallery photo: S3 object first (the relay gates ownership
// row-based via the module — can_delete_gallery_photo), then the row.
// The row reducer is idempotent, so a retried flow stays safe.
export async function deleteGalleryPhoto(
  photo: GalleryPhoto,
  actingAsOrgId?: bigint,
  actingAsOrgIdentityHex?: string,
): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  const token = getOAuthSession()?.stToken;
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${IMAGES_RELAY_URL}/img/${photo.s3Key}`, {
    method: 'DELETE',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(actingAsOrgIdentityHex ? { 'X-Acting-Org-Identity': actingAsOrgIdentityHex } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text?.includes('Not your photo') ? 'You can only delete your own gallery photos' : `Could not delete photo (${res.status})`);
  }
  await dbConnection.reducers.deleteGalleryPhoto({
    photoId: photo.id,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgIdentityHex ? Identity.fromString(actingAsOrgIdentityHex) : undefined,
  });
}

