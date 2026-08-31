import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../contexts/OrgContext';
import { getMyOrganizations } from '../utils/spacetime';
import AccountRow from './AccountRow';

function OrgSection({ profileIdentity }: { profileIdentity: string }) {
  const navigate = useNavigate();
  const { loginAsOrg, activeOrg } = useOrg();
  // Read the local cache synchronously at mount so the list is there immediately
  const [orgs, setOrgs] = useState<any[]>(() => getMyOrganizations(profileIdentity));
  const [showClaimInfo, setShowClaimInfo] = useState(false);

  useEffect(() => {
    if (!profileIdentity) return;
    setOrgs(getMyOrganizations(profileIdentity));
    const interval = setInterval(() => {
      setOrgs(getMyOrganizations(profileIdentity));
    }, 3000);
    return () => clearInterval(interval);
  }, [profileIdentity]);

  // Close the claim-info modal on Escape
  useEffect(() => {
    if (!showClaimInfo) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowClaimInfo(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showClaimInfo]);

  return (
    <div className="org-section-wrap">
      <div className="org-section">
        {orgs.length === 0 ? (
          <p className="no-orgs">No organizations yet.</p>
        ) : (
          <div className="orgs-list">
            {orgs.map(org => (
              <AccountRow
                key={org.id.toString()}
                to={`/org/${org.id}`}
                picture={org.picture || ''}
                name={org.name}
                subtitle={org.role}
                right={
                  <button onClick={() => { loginAsOrg(org); navigate('/me', { replace: true }); }} className="use-org-btn">
                    {activeOrg?.id === org.id ? 'Active' : 'Sign in'}
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="claim-org-row">
        <button onClick={() => navigate('/org/create')} className="claim-org-btn">Create Organization</button>
        <button onClick={() => setShowClaimInfo(true)} className="claim-org-btn secondary">Claim Existing Organization</button>
      </div>

      {showClaimInfo && createPortal(
        <div className="claim-modal-backdrop" onClick={() => setShowClaimInfo(false)}>
          <div className="claim-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Claim an Existing Organization</h3>
            <p>
              Search for organizations without a leader and tap <strong>Claim</strong> on their
              profile to take over. Verification is coming soon.
            </p>
            <div className="claim-modal-actions">
              <button onClick={() => setShowClaimInfo(false)} className="claim-modal-cancel">Cancel</button>
              <button
                onClick={() => { setShowClaimInfo(false); navigate('/search?claimable=1'); }}
                className="claim-modal-search"
              >
                Search organizations
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .org-section { background: white; border-radius: 12px; padding: 8px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .no-orgs { color: #999; font-size: 14px; padding: 12px 0; }
        .orgs-list { display: flex; flex-direction: column; }
        .use-org-btn { padding: 6px 16px; background: white; color: #667eea; border: 1px solid #667eea; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s, color 0.15s; }
        .use-org-btn:hover { background: #667eea; color: white; }
        .claim-org-row { display: flex; gap: 10px; justify-content: center; margin-top: 20px; flex-wrap: wrap; }
        .claim-org-btn { padding: 10px 22px; background: #f59e0b; color: white; border: none; border-radius: 24px; font-weight: 600; font-size: 14px; cursor: pointer; }
        .claim-org-btn:hover { background: #d97706; }
        .claim-org-btn.secondary { background: white; color: #f59e0b; border: 1px solid #f59e0b; }
        .claim-org-btn.secondary:hover { background: #f59e0b; color: white; }
        .claim-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 20px; }
        .claim-modal { background: white; border-radius: 12px; padding: 24px 22px; max-width: 340px; width: 100%; box-shadow: 0 8px 30px rgba(0,0,0,0.15); text-align: center; }
        .claim-modal h3 { margin: 0 0 10px; color: #222; font-size: 17px; }
        .claim-modal p { margin: 0 0 18px; color: #555; font-size: 14px; line-height: 1.5; }
        .claim-modal-actions { display: flex; gap: 10px; justify-content: center; }
        .claim-modal-cancel { padding: 9px 22px; background: #f3f4f6; color: #374151; border: none; border-radius: 20px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .claim-modal-cancel:hover { background: #e5e7eb; }
        .claim-modal-search { padding: 9px 22px; background: #667eea; color: white; border: none; border-radius: 20px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .claim-modal-search:hover { background: #5a6fd6; }
      `}</style>
    </div>
  );
}

export default OrgSection;