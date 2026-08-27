import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { orgAccountIdentityHex } from '../utils/spacetime';

export interface ActiveOrg {
  id: bigint;
  name: string;
  picture: string;
  city: string;
  description: string;
  identity: string; // deterministic org account identity (0x4f + id)
}

interface OrgContextType {
  activeOrg: ActiveOrg | null;
  loginAsOrg: (org: { id: bigint; name: string; picture?: string; city?: string; description?: string }) => void;
  logoutOrg: () => void;
}

const OrgContext = createContext<OrgContextType>({
  activeOrg: null,
  loginAsOrg: () => {},
  logoutOrg: () => {},
});

export const useOrg = () => useContext(OrgContext);

// Persist the org account session across reloads/navigation (bigint-safe JSON)
const STORAGE_KEY = 'veri_active_org';

function serializeOrg(org: ActiveOrg): string {
  return JSON.stringify({ ...org, id: org.id.toString() });
}

function parseOrg(raw: string): ActiveOrg | null {
  try {
    const o = JSON.parse(raw);
    if (!o || o.id === undefined) return null;
    return { ...o, id: BigInt(o.id) };
  } catch {
    return null;
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [activeOrg, setActiveOrg] = useState<ActiveOrg | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseOrg(raw) : null;
  });

  const loginAsOrg = useCallback((org: { id: bigint; name: string; picture?: string; city?: string; description?: string }) => {
    const full: ActiveOrg = {
      id: org.id,
      name: org.name,
      picture: org.picture || '',
      city: org.city || '',
      description: org.description || '',
      identity: orgAccountIdentityHex(org.id),
    };
    setActiveOrg(full);
    try {
      localStorage.setItem(STORAGE_KEY, serializeOrg(full));
    } catch {
      /* storage unavailable — session-only */
    }
  }, []);

  const logoutOrg = useCallback(() => {
    setActiveOrg(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <OrgContext.Provider value={{ activeOrg, loginAsOrg, logoutOrg }}>
      {children}
    </OrgContext.Provider>
  );
}
