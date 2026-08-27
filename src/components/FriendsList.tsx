import { useEffect, useState } from 'react';
import { getFriends } from '../utils/spacetime';
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
  // Own-profile only: a toggle to hide the list from other people
  hideToggle?: { label: string; checked: boolean; onChange: (v: boolean) => void; busy?: boolean };
}

// Shared friends/members list used by profile pages (individual + org members via getFriends? no — orgs use members)
function FriendsList({ identity, emptyText, hideToggle }: FriendsListProps) {
  // Read the local cache synchronously at mount so the list is there immediately
  const [friends, setFriends] = useState<FriendEntry[]>(() => getFriends(identity));

  useEffect(() => {
    const refresh = () => setFriends(getFriends(identity));
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [identity]);

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
