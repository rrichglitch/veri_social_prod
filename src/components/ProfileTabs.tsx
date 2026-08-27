export interface ProfileTab {
  key: string;
  label: string;
}

interface ProfileTabsProps {
  tabs: ProfileTab[];
  active: string;
  onChange: (key: string) => void;
}

// Shared profile tab selector — identical underline style on every profile page
// (own profile, other people's profiles, org account view).
function ProfileTabs({ tabs, active, onChange }: ProfileTabsProps) {
  return (
    <div className="profile-tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`profile-tab ${active === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
      <style>{`
        .profile-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          border-bottom: 1px solid #e0e0e0;
          overflow-x: auto;
        }
        .profile-tab {
          padding: 10px 20px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          font-size: 15px;
          font-weight: 600;
          color: #666;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .profile-tab:hover {
          color: #667eea;
        }
        .profile-tab.active {
          color: #667eea;
          border-bottom-color: #667eea;
        }
      `}</style>
    </div>
  );
}

export default ProfileTabs;
