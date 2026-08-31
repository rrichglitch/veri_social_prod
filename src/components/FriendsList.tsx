import { useEffect, useState } from 'react';
import { getFriends } from '../utils/spacetime';
import { fetchProfileFriends, fetchOrgMembers, refreshFetchedFriends, refreshFetchedOrgMembers } from '../utils/clientData';
import AccountRow from './AccountRow';
import HideToggle from './HideToggle';

interface FriendEntry {
  identity: string;
  name: string;
  picture: string;
  city: string;
}

interface FriendsListProps {
  identity: string;
  emptyText: string;
  // Data source (scoped data layer):
  //   'own'      — my_friendships view (sync, live via subscription)
  //   'friends'  — another individual's friends (RPC, refreshed by poll)
  //   'members'  — an org's members with roles (RPC, refreshed by poll)
  mode?: 'own' | 'friends' | 'members';
  // Required when mode === 'members'
  orgId?: bigint;
  // Own-profile only: a toggle to hide the list from other people
  hideToggle?: { label: string; checked: boolean; onChange: (v: boolean) => void; busy?: boolean };
}

// Shared friends/members list used by profile pages (individual + org
// members). Own lists read the subscription view; other people's lists are
// fetched on demand (hide_friends / hide_members respected server-side).
function FriendsList({ identity, emptyText, mode = 'own', orgId, hideToggle }: FriendsListProps) {
  // Read the local cache synchronously at mount so the list is there immediately
  const [friends, setFriends] = useState<FriendEntry[]>(() =>
    mode === 'own' ? getFriends(identity) : []
  );

  useEffect(() => {
    if (mode === 'own') {
      const refresh = () => setFriends(getFriends(identity));
      refresh();
      const t = setInterval(refresh, 2000);
      return () => clearInterval(t);
    }
    // Other people's lists: fetch on demand (memoized) and refresh on a poll
    // so new friends/members appear while the page is open.
    let alive = true;
    const refresh = async () => {
      try {
        if (mode === 'members' && orgId !== undefined) {
          refreshFetchedOrgMembers(orgId);
          const rows = await fetchOrgMembers(orgId);
          if (alive) setFriends(rows.map((m) => ({ identity: m.identity, name: m.fullName, picture: m.picture, city: m.city })));
        } else {
          refreshFetchedFriends(identity);
          const rows = await fetchProfileFriends(identity);
          if (alive) setFriends(rows.map((f) => ({ identity: f.identity, name: f.fullName, picture: f.picture, city: f.city })));
        }
      } catch {
        /* ignore — next poll retries */
      }
    };
    refresh();
    const t = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [identity, mode, orgId]);

  return (
    <div className="friends-section">
      <div className="friends-card">
        {friends.length === 0 ? (
          <div className="empty-story">
            <p>{emptyText}</p>
          </div>
        ) : (
          <div className="friends-list">
            {friends.map((f) => (
              <AccountRow
                key={f.identity}
                to={`/profile/${f.identity}`}
                picture={f.picture}
                name={f.name}
                subtitle={f.city || undefined}
              />
            ))}
          </div>
        )}
      </div>
      {hideToggle && (
        <HideToggle label={hideToggle.label} checked={hideToggle.checked} onChange={hideToggle.onChange} busy={hideToggle.busy} />
      )}
      <style>{`
        .friends-card { background: white; border-radius: 12px; padding: 8px 20px; margin-top: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .friends-list { display: flex; flex-direction: column; }
      `}</style>
    </div>
  );
}

export default FriendsList;