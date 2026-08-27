
export const APP_URL = 'https://veri.social';
export const BASE_PATH = import.meta.env.VITE_BASE_PATH || '';
export const SPACETIMEDB_HOST = import.meta.env.VITE_STDB_HOST || 'maincloud.spacetimedb.com';

/**
 * THE ENVIRONMENT GATE — the single file that differs between deployments.
 *
 * The dev frontend (this repo) builds against the `repsoc` database and
 * deploys to test.veri.social. The production frontend (separate repo,
 * veri.social) builds the SAME code but points at the `verisocial` database.
 * Switch via .env (VITE_STDB_MODULE) or by editing this constant.
 * All runtime code reads backend identity from here — nothing else in the
 * app knows the database name.
 */
export const SPACETIMEDB_MODULE = import.meta.env.VITE_STDB_MODULE || 'repsoc';

// Our own OAuth relay (Google + Facebook) — replaces SpacetimeCloud OIDC
export const AUTH_RELAY_URL = import.meta.env.VITE_AUTH_RELAY_URL || 'https://auth.veri.social';

export const CHAR_LIMITS = {
  fullName: 100,
  city: 100,
  description: 500,
  storyContent: 2000,
} as const;

export const MAX_MEDIA_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_MEDIA_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'video/mp4',
  'video/webm',
] as const;

export const RATE_LIMIT_HOURS = 0;

// Cloudflare Turnstile site key (public)
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAADHTL34hzoQvhfs4';
