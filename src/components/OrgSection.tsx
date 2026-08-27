import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../contexts/OrgContext';
import { getMyOrganizations, createOrganization } from '../utils/spacetime';
import AccountRow from './AccountRow';
import { geocodeCity } from '../utils/geo';

function OrgSection({ profileIdentity }: { profileIdentity: string }) {
  const navigate = useNavigate();
  const { loginAsOrg, activeOrg } = useOrg();
  // Read the local cache synchronously at mount so the list is there immediately
  const [orgs, setOrgs] = useState<any[]>(() => getMyOrganizations(profileIdentity));
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', picture: '', city: '', description: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profileIdentity) return;
    setOrgs(getMyOrganizations(profileIdentity));
    const interval = setInterval(() => {
      setOrgs(getMyOrganizations(profileIdentity));
    }, 3000);
    return () => clearInterval(interval);
  }, [profileIdentity]);

  const handlePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max = 200;
      let w = img.width, h = img.height;
      if (w > h) { if (w > max) { h *= max / w; w = max; } }
      else { if (h > max) { w *= max / h; h = max; } }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      setForm({...form, picture: canvas.toDataURL('image/jpeg', 0.7)});
    };
    img.src = URL.createObjectURL(file);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    try {
      // Geocode the city so the org appears on location-based search (best effort)
      const geo = await geocodeCity(form.city);
      await createOrganization(form.name, form.picture || '/veri.png', form.city, form.description, geo?.lat, geo?.lng);
      setShowCreate(false);
      setForm({ name: '', picture: '', city: '', description: '' });
      setOrgs(getMyOrganizations(profileIdentity));
    } catch (err: any) {
      alert(err.message || 'Failed to create');
    }
  };

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

      {!showCreate ? (
        <div className="claim-org-row">
          <button onClick={() => setShowCreate(true)} className="claim-org-btn">Claim New Organization</button>
          <button onClick={() => alert('Claim Existing Organization: search for your organization and tap "Claim" on its profile. Verification coming soon.')} className="claim-org-btn secondary">Claim Existing Organization</button>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="create-org-form">
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Organization name" required className="org-input" />
          <input type="file" ref={fileInputRef} accept="image/*" onChange={handlePictureChange} style={{display:'none'}} />
          <div onClick={() => fileInputRef.current?.click()} className="org-pic-upload">
            {form.picture ? (
              <img src={form.picture} alt="Preview" className="org-pic-preview" />
            ) : (
              <span>Tap to upload picture</span>
            )}
          </div>
          <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="City" required className="org-input" />
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" required className="org-input" rows={2} />
          <div className="org-form-actions">
            <button type="submit" className="org-submit">Create</button>
            <button type="button" onClick={() => setShowCreate(false)} className="org-cancel">Cancel</button>
          </div>
        </form>
      )}

      <style>{`
        .org-section { background: white; border-radius: 12px; padding: 8px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .no-orgs { color: #999; font-size: 14px; padding: 12px 0; }
        .orgs-list { display: flex; flex-direction: column; }
        .use-org-btn { padding: 6px 16px; background: white; color: #667eea; border: 1px solid #667eea; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s, color 0.15s; }
        .use-org-btn:hover { background: #667eea; color: white; }
        .pro-prompt { background: #fff8e1; padding: 16px; border-radius: 8px; text-align: center; margin-top: 16px; }
        .pro-prompt p { margin: 0 0 8px; color: #92400e; font-size: 14px; }
        .create-org-row { display: flex; justify-content: center; margin-top: 20px; }
        .claim-org-row { display: flex; gap: 10px; justify-content: center; margin-top: 20px; flex-wrap: wrap; }
        .claim-org-btn { padding: 10px 22px; background: #f59e0b; color: white; border: none; border-radius: 24px; font-weight: 600; font-size: 14px; cursor: pointer; }
        .claim-org-btn:hover { background: #d97706; }
        .claim-org-btn.secondary { background: white; color: #f59e0b; border: 1px solid #f59e0b; }
        .claim-org-btn.secondary:hover { background: #f59e0b; color: white; }
        .create-org-btn { padding: 10px 28px; background: #22c55e; color: white; border: none; border-radius: 24px; font-weight: 600; font-size: 14px; cursor: pointer; }
        .create-org-btn:hover { background: #16a34a; }
        .create-org-form { display: flex; flex-direction: column; gap: 8px; background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .org-input { padding: 10px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 14px; outline: none; }
        .org-input:focus { border-color: #667eea; }
        .org-pic-upload { padding: 16px; border: 2px dashed #e0e0e0; border-radius: 8px; text-align: center; cursor: pointer; color: #999; font-size: 14px; display: flex; align-items: center; justify-content: center; min-height: 60px; }
        .org-pic-upload:hover { border-color: #667eea; }
        .org-pic-preview { width: 60px; height: 60px; border-radius: 8px; object-fit: cover; }
        .org-form-actions { display: flex; gap: 8px; }
        .org-submit { padding: 8px 20px; background: #667eea; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .org-cancel { padding: 8px 20px; background: #999; color: white; border: none; border-radius: 6px; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default OrgSection;
