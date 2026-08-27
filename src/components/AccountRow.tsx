import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface AccountRowProps {
  to: string;            // link target (profile page)
  picture: string;
  name: string;
  subtitle?: string;     // city for friends, role for org members
  right?: ReactNode;     // optional control on the right (e.g. Sign in button)
}

// Shared list row: avatar | name + subtitle | optional right control.
// Used by the friends list and the organizations list so they look identical.
function AccountRow({ to, picture, name, subtitle, right }: AccountRowProps) {
  return (
    <div className="account-row">
      <Link to={to} className="account-link">
        {picture ? (
          <img src={picture} alt={name} className="account-avatar" />
        ) : (
          <div className="account-avatar-placeholder" />
        )}
        <div className="account-info">
          <span className="account-name">{name}</span>
          {subtitle && <span className="account-subtitle">{subtitle}</span>}
        </div>
      </Link>
      {right}
      <style>{`
        .account-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
        .account-row:last-child { border-bottom: none; }
        .account-link { display: flex; align-items: center; gap: 12px; text-decoration: none; color: #333; flex: 1; min-width: 0; }
        .account-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .account-avatar-placeholder { width: 44px; height: 44px; border-radius: 50%; background: #e0e0e0; flex-shrink: 0; }
        .account-info { display: flex; flex-direction: column; min-width: 0; }
        .account-name { font-size: 15px; font-weight: 600; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .account-subtitle { font-size: 12px; color: #999; }
      `}</style>
    </div>
  );
}

export default AccountRow;
