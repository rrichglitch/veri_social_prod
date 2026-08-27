import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { currentUserEmail } from '../utils/authState';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';
import { getFriendChats, getMyOrganizations, getOrganizationMembers, getProfileByEmail } from '../utils/spacetime';
import { useOrg } from '../contexts/OrgContext';

function FriendsPage() {
  const navigate = useNavigate();
  const { activeOrg } = useOrg();
  const [friends, setFriends] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const email = currentUserEmail();
    if (!email) return;
    try {
      getProfileByEmail(email).then(p => {
        if (p) {
          const id = p.identity.toHexString();
          if (activeOrg) {
            // Org account: list ALL individual members, org chats = its own org
            setFriends(getOrganizationMembers(activeOrg.id));
            setOrgs([{
              id: activeOrg.id,
              name: activeOrg.name,
              picture: activeOrg.picture,
              role: 'member',
            }]);
          } else {
            setFriends(getFriendChats(id));
            setOrgs(getMyOrganizations(id));
          }
        }
      });
    } catch {}
  }, [activeOrg]);

  const filteredFriends = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.toLowerCase();
    return friends.filter(f => f.fullName.toLowerCase().includes(q));
  }, [friends, search]);

  return (
    <div className="messages-page">
      <TopBar
        left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>}
        center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        absoluteCenter
        right={<AuthActions hideChat />}
      />
      <main className="main-content">
        <input
          type="text"
          placeholder="Search friends..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
        {orgs.length > 0 && (
          <div className="chat-section">
            <h3>Organization Chats</h3>
            {orgs.map(org => (
              <button key={org.id.toString()} onClick={() => navigate(`/org-chat/${org.id}`)} className="chat-row">
                {org.picture ? <img src={org.picture} alt={org.name} className="chat-avatar" /> : <div className="chat-avatar-placeholder" />}
                <div className="chat-info">
                  <span className="chat-name">{org.name}</span>
                  <span className="chat-role">{org.role}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="chat-section">
          <h3>{activeOrg ? 'Members' : 'Friends'}</h3>
          {filteredFriends.length === 0 ? (
            <p className="empty">{activeOrg ? 'No members yet.' : 'No friends yet. Add friends to start chatting!'}</p>
          ) : (
            filteredFriends.map(f => (
              <button key={f.identity} onClick={() => navigate(activeOrg ? `/profile/${f.identity}` : `/messages/${f.identity}`)} className="chat-row">
                {f.picture ? <img src={f.picture} alt={f.fullName} className="chat-avatar" /> : <div className="chat-avatar-placeholder" />}
                <span className="chat-name">{f.fullName}</span>
              </button>
            ))
          )}
        </div>
      </main>

      <style>{`
        .messages-page { min-height: 100vh; background: #f5f5f5; }
        .main-content { max-width: 600px; margin: 0 auto; padding: 24px; }
        .search-input {
          width: 100%; padding: 12px 16px; border: 1px solid #e0e0e0; border-radius: 24px;
          font-size: 15px; outline: none; margin-bottom: 20px; box-sizing: border-box;
        }
        .search-input:focus { border-color: #667eea; }
        .chat-section { margin-bottom: 24px; }
        .chat-section h3 { margin: 0 0 12px; color: #333; font-size: 16px; }
        .chat-row { display: flex; align-items: center; gap: 12px; padding: 12px; background: white; border: none; border-radius: 8px; width: 100%; cursor: pointer; margin-bottom: 4px; text-align: left; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .chat-row:hover { background: #f8f9ff; }
        .chat-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }
        .chat-avatar-placeholder { width: 44px; height: 44px; border-radius: 50%; background: #e0e0e0; }
        .chat-name { font-weight: 600; color: #333; }
        .chat-role { font-size: 12px; color: #999; }
        .chat-info { display: flex; flex-direction: column; }
        .empty { text-align: center; padding: 32px; color: #999; }
      `}</style>
    </div>
  );
}

export default FriendsPage;
