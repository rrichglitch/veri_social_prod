interface HideToggleProps {
  label: string;       // e.g. "Hide your friends" / "Hide your members"
  checked: boolean;
  onChange: (checked: boolean) => void;
  busy?: boolean;
}

// Privacy toggle shown below the friends/members list on your own profile
function HideToggle({ label, checked, onChange, busy }: HideToggleProps) {
  return (
    <div className="hide-toggle-section">
      <label className={`hide-toggle ${checked ? 'on' : ''}`}>
        <span className="hide-toggle-text">{label}</span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={busy}
        />
        <span className="hide-switch" aria-hidden="true" />
      </label>
      {busy && <p className="hide-toggle-busy">Updating…</p>}
      <style>{`
        .hide-toggle-section { background: white; border-radius: 12px; padding: 16px 20px; margin-top: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .hide-toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; }
        .hide-toggle input { display: none; }
        .hide-toggle-text { flex: 1; font-size: 14px; color: #333; font-weight: 500; }
        .hide-switch { position: relative; width: 44px; height: 24px; background: #d1d5db; border-radius: 12px; transition: background 0.2s; flex-shrink: 0; }
        .hide-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .hide-toggle.on .hide-switch { background: #667eea; }
        .hide-toggle.on .hide-switch::after { transform: translateX(20px); }
        .hide-toggle input:disabled + .hide-switch { opacity: 0.6; }
        .hide-toggle-busy { margin: 8px 0 0; font-size: 12px; color: #667eea; }
      `}</style>
    </div>
  );
}

export default HideToggle;
