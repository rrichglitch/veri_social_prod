interface ProfileSettingsTabProps {
  // The shared precise-location control (per-page wiring — individual vs org).
  // Rendered as its own card at the top of the tab.
  locationControl: React.ReactNode | null;
  // Destructive account action at the bottom, after deliberate spacing.
  // Omit the whole danger section by leaving the label unset.
  dangerLabel?: string;
  // Small note above the danger button (e.g. the disabled-state note).
  dangerHint?: string;
  // Page handler — opens the typed-confirmation modal (ConfirmTypeModal).
  // The modal owns the actual destructive step.
  onDanger?: () => void;
}

// Shared Settings tab for the individual /me page and the org account view:
// precise-location card on top, destructive account action at the bottom with
// deliberate space between. One implementation, both pages. Destruction goes
// through the page's ConfirmTypeModal (typed confirmation, no inline states).
function ProfileSettingsTab({
  locationControl,
  dangerLabel,
  dangerHint,
  onDanger,
}: ProfileSettingsTabProps) {
  return (
    <div className="settings-tab">
      {locationControl}
      {dangerLabel && (
        <>
          <div className="settings-danger-spacer" />
          <div className="settings-danger-card">
            {dangerHint && <p className="settings-danger-hint">{dangerHint}</p>}
            <button className="danger-btn" onClick={onDanger}>
              {dangerLabel}
            </button>
          </div>
        </>
      )}
      <style>{`
        .settings-danger-spacer { height: 24px; }
        .settings-danger-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .settings-danger-hint { margin: 0 0 12px; font-size: 13px; color: #888; line-height: 1.4; }
        .danger-btn { width: 100%; padding: 12px 16px; border: none; border-radius: 8px; background: #dc2626; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .danger-btn:hover { background: #b91c1c; }
      `}</style>
    </div>
  );
}

export default ProfileSettingsTab;