import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';
import PreciseLocationToggle, { type LocationPrecision } from '../components/PreciseLocationToggle';
import { useApp } from '../App';
import { getProfileByEmail, createOrganization, getMyOrganizations, getMyOrgClaimFee, disconnectFromSpacetimeDB } from '../utils/spacetime';
import { clearOAuthSession } from '../utils/oauthSession';
import { requestCheckout } from '../utils/payments';
import { markCheckoutReturn, skipCheckoutDetour } from '../utils/checkoutReturn';
import { getBrowserLocation, jitterLocation, reverseGeocodeResilient } from '../utils/geo';

const PENDING_KEY = 'veri_pending_org';

interface PendingOrg {
  name: string;
  picture: string;
  description: string;
  city: string;
  lat: number;
  lng: number;
  precision: 'exact' | 'approx';
}

const LOC_ERR_COPY = (e: any) =>
  e?.message === 'Geolocation not supported on this device'
    ? 'This device does not support location services.'
    : 'Could not get your location. Check that location permissions are enabled for this site.';

function CreateOrgPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email } = useApp();

  const handleLogout = () => {
    clearOAuthSession();
    disconnectFromSpacetimeDB();
    navigate('/', { replace: true });
  };

  const [form, setForm] = useState<{ name: string; picture: string; description: string }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (saved && saved.name !== undefined) {
        return { name: saved.name, picture: saved.picture || '', description: saved.description || '' };
      }
    } catch {}
    return { name: '', picture: '', description: '' };
  });
  const [precision, setPrecision] = useState<LocationPrecision>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (saved && (saved.precision === 'exact' || saved.precision === 'approx')) return saved.precision;
    } catch {}
    return 'exact';
  });
  const [locCoords, setLocCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locCity, setLocCity] = useState<string | null>(null);
  const [locStatus, setLocStatus] = useState<'idle' | 'fetching' | 'done'>('idle');
  const [identity, setIdentity] = useState('');
  const [feePaid, setFeePaid] = useState<boolean>(() => getMyOrgClaimFee().length > 0);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orgClaimSuccess = new URLSearchParams(location.search).get('org_claim') === 'success';

  // Resolve identity + keep the claim-fee cache fresh
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const who = email || '';
      if (who) {
        try {
          const p = await getProfileByEmail(who);
          if (alive && p) setIdentity(p.identity.toHexString());
        } catch {}
      }
      if (alive) setFeePaid(getMyOrgClaimFee().length > 0);
    };
    load();
    const t = setInterval(() => { if (alive) setFeePaid(getMyOrgClaimFee().length > 0); }, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [email]);

  // Get (or refresh) the location fix + derive the city from it.
  const handleLocate = async (): Promise<{ lat: number; lng: number } | null> => {
    setLocStatus('fetching');
    try {
      const pos = await getBrowserLocation();
      const city = await reverseGeocodeResilient(pos.lat, pos.lng);
      setLocCoords(pos);
      if (city) setLocCity(city);
      setLocStatus('done');
      return pos;
    } catch (e: any) {
      setLocStatus('idle');
      alert(LOC_ERR_COPY(e));
      return null;
    }
  };

  const doCreate = async (data: PendingOrg) => {
    setCreating(true);
    try {
      await createOrganization(
        data.name,
        data.picture || '/veri.png',
        data.city,
        data.description,
        data.lat,
        data.lng,
        data.precision,
      );
      const mine = getMyOrganizations(identity);
      const created = mine.find((o: any) => o.name === data.name);
      if (created) navigate(`/org/${created.id.toString()}`);
      else navigate('/me', { replace: true });
    } catch (e: any) {
      alert(e?.message || 'Failed to create organization');
      setCreating(false);
    }
  };

  // Returning from Stripe: poll for the fee row, then create the org from the
  // pending form automatically. No pop-ups — the page state carries the flow.
  useEffect(() => {
    if (!orgClaimSuccess) return;
    markCheckoutReturn();
    setConfirming(true);
    let alive = true;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      const paid = getMyOrgClaimFee().length > 0;
      setFeePaid(paid);
      const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null') as PendingOrg | null;
      if (paid && pending && pending.name && pending.lat !== undefined) {
        if (!alive) return;
        setConfirming(false);
        localStorage.removeItem(PENDING_KEY);
        await doCreate(pending);
        return;
      }
      // Paid but no pending form — the org was already created in an earlier
      // pass (user backed into this page). Keep the landing URL intact so the
      // back button can still skip the Stripe entry.
      if (paid && !pending) {
        if (alive) setConfirming(false);
        return;
      }
      if (tries >= 20) {
        if (alive) setConfirming(false);
        return;
      }
      setTimeout(poll, 2000);
    };
    setTimeout(poll, 2000);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgClaimSuccess]);

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
      setForm({ ...form, picture: canvas.toDataURL('image/jpeg', 0.7) });
    };
    img.src = URL.createObjectURL(file);
  };

  // Location is REQUIRED: fetch the fix if not captured yet, derive the city,
  // and jitter client-side when the toggle is off (approx). The backend stores
  // exactly what is sent, at the claimed precision.
  const resolveLocation = async (): Promise<{ city: string; lat: number; lng: number; precision: 'exact' | 'approx' } | null> => {
    let coords = locCoords;
    let city = locCity;
    if (!coords) {
      const pos = await handleLocate();
      if (!pos) return null;
      coords = pos;
    }
    if (!city) {
      try {
        city = await reverseGeocodeResilient(coords.lat, coords.lng);
        if (city) setLocCity(city);
      } catch {}
    }
    if (!city) {
      alert('Could not determine your city from your location. Please try again.');
      return null;
    }
    const isExact = precision === 'exact';
    const toSend = isExact ? coords : jitterLocation(coords.lat, coords.lng, 5);
    return { city, lat: toSend.lat, lng: toSend.lng, precision: isExact ? 'exact' : 'approx' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.description) {
      alert('Please fill in organization name and description.');
      return;
    }
    if (!identity) {
      alert('Could not resolve your account — please refresh and try again.');
      return;
    }
    const loc = await resolveLocation();
    if (!loc) return;
    const pending: PendingOrg = {
      name: form.name.trim(),
      picture: form.picture,
      description: form.description.trim(),
      city: loc.city,
      lat: loc.lat,
      lng: loc.lng,
      precision: loc.precision,
    };
    const paid = feePaid || getMyOrgClaimFee().length > 0;
    if (paid) {
      await doCreate(pending);
      return;
    }
    // Fee unpaid: save the form (+ location), pay, then create automatically on return.
    setPaying(true);
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      const { url } = await requestCheckout('org', identity, email || undefined);
      window.location.assign(url);
    } catch (err: any) {
      alert(err?.message || 'Failed to start checkout. Please try again.');
      setPaying(false);
    }
  };

  const saveField = (key: string, value: string) => setForm({ ...form, [key]: value });
  const busy = paying || creating || confirming;

  const handleBack = () => {
    if (!skipCheckoutDetour()) navigate(-1);
  };

  return (
    <div className="create-org-page">
      <TopBar
        left={<button onClick={handleBack} className="topbar-back">← Back</button>}
        center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        right={<AuthActions profileReplacement={<button onClick={handleLogout} className="topbar-signin" style={{background:"#dc2626"}}>Log Out</button>} />}
        absoluteCenter
      />
      <div className="create-org-body">
        <h1 className="page-title">Create Organization</h1>
        <div className="loc-settings-wrap">
          <PreciseLocationToggle
            isExact={precision === 'exact'}
            onEnable={async () => setPrecision('exact')}
            onDisable={async () => setPrecision('approx')}
          />
        </div>
        <form onSubmit={handleSubmit} className="create-org-card">
          <input value={form.name} onChange={e => saveField('name', e.target.value)} placeholder="Organization name" required disabled={busy} className="org-input" />
          <input type="file" ref={fileInputRef} accept="image/*" onChange={handlePictureChange} style={{ display: 'none' }} disabled={busy} />
          <div onClick={() => !busy && fileInputRef.current?.click()} className={`org-pic-upload${busy ? ' disabled' : ''}`}>
            {form.picture ? (
              <img src={form.picture} alt="Preview" className="org-pic-preview" />
            ) : (
              <span>Tap to upload picture</span>
            )}
          </div>
          <textarea value={form.description} onChange={e => saveField('description', e.target.value)} placeholder="Description" required disabled={busy} className="org-input" rows={3} />
          <div className="loc-row">
            {locCity ? (
              <>
                <p className="loc-city">📍 {locCity}</p>
                <button type="button" className="loc-refresh" onClick={handleLocate} disabled={busy || locStatus === 'fetching'}>
                  {locStatus === 'fetching' ? 'Locating…' : 'Update'}
                </button>
              </>
            ) : (
              <button type="button" className="loc-btn" onClick={handleLocate} disabled={busy || locStatus === 'fetching'}>
                {locStatus === 'fetching' ? 'Getting location…' : '📍 Get my location'}
              </button>
            )}
          </div>
          <button type="submit" className="org-submit" disabled={busy}>
            {busy && <span className="btn-spinner" />}
            {creating ? 'Creating…' : paying ? 'Opening payment…' : confirming ? 'Confirming payment…' : feePaid ? 'Create Organization' : 'Pay $19.99 & Create Organization'}
          </button>
          {confirming ? (
            <p className="confirm-note"><span className="btn-spinner small" /> Confirming your payment — your organization will be created automatically.</p>
          ) : (
            !feePaid && <p className="fee-note">One-time $19.99 claim fee · strictly separate from Pro — you'll be taken to secure Stripe checkout.</p>
          )}
        </form>
      </div>
      <style>{`
        .create-org-page { min-height: 100vh; background: #f5f5f5; }
        .topbar-back { background: none; border: none; font-size: 15px; color: #667eea; cursor: pointer; }
        .topbar-logo img { height: 28px; }
        .create-org-body { display: flex; flex-direction: column; align-items: center; padding: 24px 16px; }
        .page-title { margin: 0 0 18px; font-size: 20px; font-weight: 700; color: #222; text-align: center; }
        .loc-settings-wrap { width: 100%; max-width: 380px; margin-bottom: 14px; }
        .loc-settings-wrap .location-settings { margin-bottom: 0; }
        .create-org-card { display: flex; flex-direction: column; gap: 10px; background: white; border-radius: 12px; padding: 24px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 380px; width: 100%; }
        .org-input { padding: 10px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 14px; outline: none; font-family: inherit; resize: vertical; }
        .org-input:focus { border-color: #667eea; }
        .org-pic-upload { padding: 16px; border: 2px dashed #e0e0e0; border-radius: 8px; text-align: center; cursor: pointer; color: #999; font-size: 14px; display: flex; align-items: center; justify-content: center; min-height: 60px; }
        .org-pic-upload:hover { border-color: #667eea; }
        .org-pic-upload.disabled { opacity: 0.6; pointer-events: none; }
        .org-pic-preview { width: 60px; height: 60px; border-radius: 8px; object-fit: cover; }
        .loc-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 2px; }
        .loc-city { margin: 0; font-size: 14px; font-weight: 600; color: #333; }
        .loc-btn { padding: 9px 16px; background: white; color: #667eea; border: 1px solid #667eea; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s, color 0.15s; }
        .loc-btn:hover { background: #667eea; color: white; }
        .loc-btn:disabled { opacity: 0.6; cursor: default; }
        .loc-refresh { background: none; border: none; color: #667eea; font-size: 13px; font-weight: 600; cursor: pointer; }
        .loc-refresh:disabled { opacity: 0.6; cursor: default; }
        .org-submit { padding: 12px; background: #22c55e; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .org-submit:hover { background: #16a34a; }
        .org-submit:disabled { opacity: 0.7; cursor: default; }
        .btn-spinner { width: 15px; height: 15px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: btnspin 0.8s linear infinite; display: inline-block; }
        .btn-spinner.small { width: 12px; height: 12px; border-width: 2px; vertical-align: -2px; margin-right: 6px; }
        @keyframes btnspin { to { transform: rotate(360deg); } }
        .confirm-note { margin: 10px 0 0; color: #667eea; font-size: 13px; font-weight: 600; text-align: center; }
        .fee-note { margin: 2px 0 0; color: #999; font-size: 12px; text-align: center; }
      `}</style>
    </div>
  );
}

export default CreateOrgPage;