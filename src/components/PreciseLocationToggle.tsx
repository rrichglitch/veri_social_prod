import { useState } from 'react';

export type LocationPrecision = 'off' | 'approx' | 'exact';

interface PreciseLocationToggleProps {
  isExact: boolean;
  onEnable: () => Promise<void>;  // fetch a fresh location and store it exactly
  onDisable: () => Promise<void>; // downgrade to approximate (no new fetch needed)
}

// Shared "Precise Location" toggle: enable warns first, then fetches a fresh
// location; disable just downgrades the stored location to approximate.
function PreciseLocationToggle({ isExact, onEnable, onDisable }: PreciseLocationToggleProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [showFullWarning, setShowFullWarning] = useState(false);

  const handleToggle = async (checked: boolean) => {
    if (checked === isExact) return;
    if (checked) {
      setShowFullWarning(true);
      return;
    }
    setIsBusy(true);
    try {
      await onDisable();
    } catch (e: any) {
      alert(e?.message || 'Failed to update location');
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmFull = async () => {
    setShowFullWarning(false);
    setIsBusy(true);
    try {
      await onEnable();
    } catch (e: any) {
      alert(e?.message === 'Geolocation not supported on this device'
        ? 'This device does not support location services.'
        : 'Could not get your location. Check that location permissions are enabled for this site.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="location-settings">
      <label className={`precise-toggle ${isExact ? 'on' : ''}`}>
        <span className="precise-toggle-label">Precise Location</span>
        <span className="precise-toggle-desc">Show your exact location to people on Veri Social.</span>
        <input
          type="checkbox"
          checked={isExact}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={isBusy}
        />
        <span className="precise-switch" aria-hidden="true" />
      </label>
      {isBusy && <p className="location-busy">Updating location…</p>}

      {showFullWarning && (
        <div className="loc-modal-overlay" onClick={() => setShowFullWarning(false)}>
          <div className="loc-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Show your exact location?</h3>
            <p>
              We never track your location. Your location is only saved at the moment you change
              your city or enable Precise Location.
            </p>
            <p>
              Enabling Precise Location will show exactly where you are right now.
            </p>
            <div className="loc-modal-actions">
              <button onClick={() => setShowFullWarning(false)} className="loc-cancel-btn">Cancel</button>
              <button onClick={handleConfirmFull} className="loc-confirm-btn">Show My Exact Location</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .location-settings { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .precise-toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; }
        .precise-toggle input { display: none; }
        .precise-toggle-label { font-size: 15px; color: #333; font-weight: 700; flex-shrink: 0; }
        .precise-toggle-desc { flex: 1; font-size: 13px; color: #888; line-height: 1.3; }
        .precise-switch { position: relative; width: 46px; height: 26px; background: #d1d5db; border-radius: 13px; transition: background 0.2s; flex-shrink: 0; }
        .precise-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .precise-toggle.on .precise-switch { background: #667eea; }
        .precise-toggle.on .precise-switch::after { transform: translateX(20px); }
        .precise-toggle input:disabled + .precise-switch { opacity: 0.6; }
        .location-busy { margin-top: 8px; font-size: 12px; color: #667eea; }
        .loc-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 24px; }
        .loc-modal { background: white; border-radius: 12px; padding: 24px; max-width: 420px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        .loc-modal h3 { margin: 0 0 12px; color: #b91c1c; font-size: 17px; }
        .loc-modal p { margin: 0 0 10px; color: #444; font-size: 14px; line-height: 1.5; }
        .loc-modal-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
        .loc-cancel-btn { padding: 8px 16px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .loc-confirm-btn { padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default PreciseLocationToggle;
