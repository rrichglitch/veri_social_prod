// Descriptive-search allowance: read the caller's own allowance via view,
// handle the exhausted/disabled messages, and surface them to SearchPage.
import { getDbConnection } from './spacetime';

export interface AllowanceInfo {
  banked: number;
  usedToday: number;
  freePerDay: number;
  disabled: boolean;
}

export const FREE_PER_DAY = 2;

export async function fetchMyAllowance(): Promise<AllowanceInfo | null> {
  const db = getDbConnection();
  if (!db) return null;
  try {
    // Read via the live subscription cache (my_search_allowance is subscribed
    // by the connection in spacetime.ts). Falls back to a one-off SQL-less
    // empty state when absent.
    const rows: any[] = [];
    for (const row of (db as any).db.mySearchAllowance.iter()) {
      rows.push(row);
    }
    const r = rows[0];
    if (!r) return null;
    return {
      banked: Number(r.banked ?? 0),
      usedToday: Number(r.usedToday ?? r.used_today ?? 0),
      freePerDay: FREE_PER_DAY,
      disabled: !!r.disabled,
    };
  } catch {
    return null;
  }
}

export function allowanceMessage(info: AllowanceInfo): string | null {
  if (info.disabled) {
    return 'Your ability to earn descriptive searches has been disabled.';
  }
  if (info.usedToday >= info.freePerDay && info.banked <= 0) {
    return 'You\'re out of descriptive searches. Unlock unlimited by upgrading to Pro — or earn more by commenting on your friends\' profiles to build your reputation.';
  }
  return null;
}
