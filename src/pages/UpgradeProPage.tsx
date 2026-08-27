import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { useApp } from '../App';
import { isSignedIn } from '../utils/authState';
import { getProfileByEmail, getDbConnection, cancelProSubscription, upgradeToPro } from '../utils/spacetime';

function UpgradeProPage() {
  const navigate = useNavigate();
  const { email } = useApp();
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [sub, setSub] = useState<{ active: boolean; amountCents: number; billingPeriod: string; nextBillDate: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const who = email || '';
      if (!who) { setIsPro(false); return; }
      try {
        const p = await getProfileByEmail(who);
        if (!alive) return;
        setIsPro(!!p?.isPro);
        const db = getDbConnection();
        if (db) {
          try {
            const rows: any[] = [];
            for (const r of (db as any).db.myProSubscription.iter()) rows.push(r);
            const s = rows[0];
            if (s) {
              setSub({
                active: !!s.active,
                amountCents: Number(s.amountCents ?? s.amount_cents ?? 0),
                billingPeriod: s.billingPeriod || s.billing_period || 'monthly',
                nextBillDate: s.nextBillDate || s.next_bill_date || '',
              });
            }
          } catch {}
        }
      } catch {
        if (alive) setIsPro(false);
      }
    };
    load();
    // Refresh when the subscription cache settles
    const t = setTimeout(load, 2500);
    return () => { alive = false; clearTimeout(t); };
  }, [email]);

  const isActive = isPro === true && sub?.active !== false && !cancelled;

  const handleCancel = async () => {
    if (!window.confirm('Cancel your Pro subscription? You will lose unlimited descriptive searches at the end of the current billing period.')) return;
    setBusy(true);
    try {
      await cancelProSubscription();
      setCancelled(true);
      setIsPro(false);
      setSub((s) => (s ? { ...s, active: false } : s));
    } catch (e: any) {
      alert(e?.message || 'Failed to cancel. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpgrade = async () => {
    setBusy(true);
    try {
      await upgradeToPro();
      // reflect instantly; the page reloads state via the cache shortly after
      setIsPro(true);
      alert('You are now Pro! (Testing phase: no payment taken.)');
    } catch (e: any) {
      alert(e?.message || 'Failed to upgrade. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const amount = sub?.amountCents ? `$${(sub.amountCents / 100).toFixed(2)}` : '$4.99';
  const period = sub?.billingPeriod === 'monthly' ? 'month' : sub?.billingPeriod || 'month';
  const billDate = sub?.nextBillDate
    ? new Date(sub.nextBillDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="upgrade-page">
      <TopBar
        left={<button onClick={() => navigate(-1)} className="back-btn">← Back</button>}
        center={<span className="upgrade-title">Veri Pro</span>}
        right={<Link to={isSignedIn() ? '/home' : '/'} className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
      />
      <div className="upgrade-body">
        <div className="upgrade-card">
          <div className="pro-icon">★</div>
          <h2>Veri Pro</h2>

          {isActive ? (
            <>
              <p className="tagline">Your subscription is active — and it's a strictly separate payment from organization claiming.</p>
              <p className="sub-status"><span className="status-dot" /> Active</p>
              <ul className="benefits">
                <li>Unlimited descriptive searches</li>
                <li>Support the future of Veri Social</li>
              </ul>
              <div className="billing-box">
                <div className="bill-row"><span>Next bill</span><strong>{billDate}</strong></div>
                <div className="bill-row"><span>Amount</span><strong>{amount} / {period}</strong></div>
              </div>
              <button className="cancel-btn" onClick={handleCancel} disabled={busy}>
                {busy ? 'Cancelling…' : 'Cancel subscription'}
              </button>
              <p className="fine-print">You keep Pro through the end of the current billing period.</p>
            </>
          ) : (
            <>
              <p className="tagline">Unlimited descriptive searches. A strictly separate payment from organization claiming.</p>
              {cancelled && <p className="cancelled-note">Your subscription was cancelled.</p>}
              <ul className="benefits">
                <li>Unlimited descriptive searches</li>
                <li>Support the future of Veri Social</li>
              </ul>
              <button className="buy-btn" onClick={handleUpgrade} disabled={busy}>
                {busy ? 'Working…' : `Upgrade — ${amount} / ${period}`}
              </button>
              <p className="fine-print">Testing phase: Pro is free to try right now.</p>
            </>
          )}
        </div>
      </div>
      <style>{`
        .upgrade-page { min-height: 100vh; background: #f5f5f5; }
        .back-btn { background: none; border: none; font-size: 15px; color: #667eea; cursor: pointer; }
        .upgrade-title { font-weight: 700; font-size: 16px; color: #333; }
        .topbar-logo img { height: 28px; }
        .upgrade-body { display: flex; justify-content: center; padding: 40px 16px; }
        .upgrade-card { background: white; border-radius: 16px; padding: 36px 32px; max-width: 380px; width: 100%; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .pro-icon { font-size: 42px; background: linear-gradient(135deg, #f59e0b, #d97706); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 4px; }
        .upgrade-card h2 { margin: 0 0 6px; color: #222; }
        .tagline { color: #666; font-size: 14px; margin: 0 0 16px; }
        .sub-status { display: inline-flex; align-items: center; gap: 6px; background: #ecfdf5; color: #059669; font-size: 13px; font-weight: 700; border-radius: 14px; padding: 4px 12px; margin-bottom: 14px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
        .benefits { list-style: none; padding: 0; margin: 0 0 20px; text-align: left; }
        .benefits li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #444; }
        .benefits li:before { content: '✓'; color: #22c55e; font-weight: 700; margin-right: 10px; }
        .billing-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 16px; margin-bottom: 18px; }
        .bill-row { display: flex; justify-content: space-between; font-size: 14px; color: #555; padding: 4px 0; }
        .bill-row strong { color: #333; }
        .buy-btn { width: 100%; padding: 13px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
        .buy-btn:active { filter: brightness(0.85); }
        .buy-btn:disabled { opacity: 0.7; cursor: default; }
        .cancel-btn { width: 100%; padding: 12px; background: white; color: #dc2626; border: 1px solid #dc2626; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.15s, color 0.15s; }
        .cancel-btn:hover { background: #dc2626; color: white; }
        .cancel-btn:active { filter: brightness(0.85); }
        .cancel-btn:disabled { opacity: 0.7; cursor: default; }
        .cancelled-note { background: #fef2f2; color: #b91c1c; font-size: 13px; border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; }
        .fine-print { margin: 14px 0 0; color: #999; font-size: 12px; }
      `}</style>
    </div>
  );
}

export default UpgradeProPage;