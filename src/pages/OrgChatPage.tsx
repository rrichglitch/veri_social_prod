import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { currentUserEmail } from '../utils/authState';
import TopBar from '../components/TopBar';
import { useOrg } from '../contexts/OrgContext';
import AuthActions from '../components/AuthActions';
import { getOrgMessages, sendOrgMessage, getOrganizationById, getProfileByEmail } from '../utils/spacetime';

function OrgChatPage() {
  const { activeOrg } = useOrg();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [currentIdentity, setCurrentIdentity] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('Chat');
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const orgId = id ? BigInt(id) : 0n;

  useEffect(() => {
    if (!id) return;
    const init = async () => {
      const email = currentUserEmail();
      if (email) {
        const p = await getProfileByEmail(email);
        if (p) setCurrentIdentity(p.identity.toHexString());
      }
      const org = getOrganizationById(orgId);
      if (org) setOrgName(org.name);
    };
    init();
  }, [id]);

  useEffect(() => {
    if (!orgId) return;
    const interval = setInterval(() => {
      setMessages(getOrgMessages(orgId));
    }, 1000);
    return () => clearInterval(interval);
  }, [orgId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !orgId) return;
    if (input.length > 2000) { alert('Message too long (max 2000 characters)'); return; }
    await sendOrgMessage(orgId, input.trim());
    setInput('');
  };

  return (
    <div className="chat-page">
      <TopBar
        left={<button onClick={() => navigate('/friends')} className="topbar-back">← Back</button>}
        center={<span style={{fontWeight:600}}>{orgName}</span>}
        absoluteCenter
        right={<AuthActions hideChat />}
       
      />
      <main className="chat-main">
        <div className="msg-list">
          {messages.map(m => (
            <div key={m.id.toString()} className={`msg ${m.senderIdentity === currentIdentity ? 'mine' : 'theirs'}`}>
              {m.senderIdentity !== currentIdentity && (
                <div className="msg-sender-row">
                  {m.senderPicture ? (
                    <img src={m.senderPicture} alt={m.senderName} className="msg-sender-pic" />
                  ) : (
                    <div className="msg-sender-pic-placeholder" />
                  )}
                  <span className="msg-sender">{m.senderName}</span>
                </div>
              )}
              <p className="msg-text">{m.content}</p>
              <span className="msg-time">{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {activeOrg && (
          <div className="msg-form" style={{ justifyContent: 'center', color: '#999', fontSize: 13 }}>
            Organizations cannot send messages — only members can chat here.
          </div>
        )}
        {!activeOrg && (
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="msg-form">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." className="msg-input" autoFocus maxLength={2000} />
          <button type="submit" className="msg-send"><svg width="28" height="28" viewBox="0 0 20 20" fill="white"><path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.288z"/></svg></button>
        </form>
        )}
      </main>

      <style>{`
        .chat-page { position: fixed; inset: 0; background: #f5f5f5; display: flex; flex-direction: column; }
        .chat-main { flex: 1; display: flex; flex-direction: column; max-width: 600px; width: 100%; margin: 0 auto; padding: 0 16px; min-height: 0; }
        .msg-list { flex: 1; overflow-y: auto; padding: 16px 0 8px; -webkit-overflow-scrolling: touch; min-height: 0; }
        .msg { margin-bottom: 8px; max-width: 75%; }
        .msg.mine { margin-left: auto; text-align: right; }
        .msg.theirs { margin-right: auto; }
        .msg-sender-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
        .msg-sender-pic { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
        .msg-sender-pic-placeholder { width: 22px; height: 22px; border-radius: 50%; background: #e0e0e0; }
        .msg-sender { font-size: 12px; color: #667eea; font-weight: 600; }
        .msg-text { background: white; padding: 10px 14px; border-radius: 16px; display: inline-block; color: #333; font-size: 15px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .msg.mine .msg-text { background: #667eea; color: white; }
        .msg-time { display: block; font-size: 11px; color: #999; margin-top: 2px; }
        .msg-form { display: flex; gap: 8px; padding: 12px 0; background: #f5f5f5; max-width: 600px; width: 100%; margin: 0 auto; flex-shrink: 0; }
        .msg-input { flex: 1; padding: 10px 14px; border: 1px solid #e0e0e0; border-radius: 24px; outline: none; font-size: 15px; background: white; }
        .msg-input:focus { border-color: #667eea; }
        .msg-send { padding: 6px 12px; display: flex; align-items: center; justify-content: center; background: #667eea; color: white; border: none; border-radius: 24px; font-weight: 600; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default OrgChatPage;
