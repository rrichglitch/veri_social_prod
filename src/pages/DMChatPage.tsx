import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { currentUserEmail } from '../utils/authState';
import TopBar from '../components/TopBar';
import { useOrg } from '../contexts/OrgContext';
import AuthActions from '../components/AuthActions';
import { getDirectMessages, sendDirectMessage, getProfileByIdentity, getProfileRowByEmail } from '../utils/spacetime';
import { preloadProfile } from '../utils/clientData';

function DMChatPage() {
  const { activeOrg } = useOrg();
  const { identity: otherId } = useParams<{ identity: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [currentIdentity, setCurrentIdentity] = useState<string | null>(null);
  const [otherProfile, setOtherProfile] = useState<any>(null);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!otherId) return;
    const init = async () => {
      const email = currentUserEmail();
      if (email) {
        const p = await getProfileRowByEmail(email);
        if (p) setCurrentIdentity(p.identity.toHexString());
      }
      setOtherProfile(await getProfileByIdentity(otherId).then((p) => {
        // Click-context preload: the chat top-bar avatar links to this
        // profile — snapshot the full row so that click paints instantly.
        if (p) {
          preloadProfile(otherId, {
            fullName: p.fullName,
            picture: p.profilePictureSmall || p.profilePicture,
            fullPicture: p.profilePictureUrl || p.profilePicture,
            city: p.city,
            description: p.description,
            gender: p.gender,
            age: p.age,
            hideFriends: p.hideFriends,
            createdAtMicros: p.createdAtMicros,
            isPro: p.isPro,
          });
        }
        return p;
      }));
    };
    init();
  }, [otherId]);

  useEffect(() => {
    if (!currentIdentity || !otherId) return;
    const interval = setInterval(() => {
      setMessages(getDirectMessages(currentIdentity, otherId));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentIdentity, otherId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !otherId) return;
    if (input.length > 2000) { alert('Message too long (max 2000 characters)'); return; }
    await sendDirectMessage(otherId, input.trim());
    setInput('');
  };

  if (activeOrg) {
    return (
      <div className="chat-page">
        <TopBar
          left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>}
          center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
          absoluteCenter
          right={<AuthActions />}
        />
        <main className="main-content" style={{ padding: 40, textAlign: 'center', color: '#666' }}>
          <p>Organizations cannot use direct messaging. Only posts.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <TopBar
        left={<button onClick={() => navigate('/friends')} className="topbar-back">← Back</button>}
        center={otherProfile?.profilePictureSmall || otherProfile?.profilePicture ? (
          <Link to={`/profile/${otherProfile.identity.toHexString()}`}><img src={otherProfile.profilePictureSmall || otherProfile.profilePicture} alt={otherProfile.fullName} style={{width:36,height:36,borderRadius:'50%',objectFit:'cover'}} /></Link>
        ) : <span style={{fontWeight:600}}>{otherProfile?.fullName || 'Chat'}</span>}
        absoluteCenter
        right={<AuthActions hideChat />}
      />
      <main className="chat-main">
        <div className="msg-list">
          {messages.map(m => (
            <div key={m.id.toString()} className={`msg ${m.senderIdentity === currentIdentity ? 'mine' : 'theirs'}`}>
              <p className="msg-text">{m.content}</p>
              <span className="msg-time">{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="msg-form">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." className="msg-input" autoFocus maxLength={2000} />
          <button type="submit" className="msg-send"><svg width="28" height="28" viewBox="0 0 20 20" fill="white"><path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.288z"/></svg></button>
        </form>
      </main>

      <style>{`
        .chat-page { position: fixed; inset: 0; background: #f5f5f5; display: flex; flex-direction: column; }
        .chat-main { flex: 1; display: flex; flex-direction: column; max-width: var(--content-max-width); width: 100%; margin: 0 auto; padding: 0 16px; min-height: 0; }
        .msg-list { flex: 1; overflow-y: auto; padding: 16px 0 8px; -webkit-overflow-scrolling: touch; min-height: 0; }
        .msg { margin-bottom: 8px; max-width: 75%; }
        .msg.mine { margin-left: auto; text-align: right; }
        .msg.theirs { margin-right: auto; }
        .msg-text { background: white; padding: 10px 14px; border-radius: 16px; display: inline-block; color: #333; font-size: 15px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .msg.mine .msg-text { background: #667eea; color: white; }
        .msg-time { display: block; font-size: 11px; color: #999; margin-top: 2px; }
        .msg-form { display: flex; gap: 8px; padding: 12px 0; background: #f5f5f5; max-width: var(--content-max-width); width: 100%; margin: 0 auto; flex-shrink: 0; }
        .msg-input { flex: 1; padding: 10px 14px; border: 1px solid #e0e0e0; border-radius: 24px; outline: none; font-size: 15px; background: white; }
        .msg-input:focus { border-color: #667eea; }
        .msg-send { padding: 6px 12px; display: flex; align-items: center; justify-content: center; background: #667eea; color: white; border: none; border-radius: 24px; font-weight: 600; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default DMChatPage;
