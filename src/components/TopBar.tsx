import type { CSSProperties, ReactNode } from 'react';

interface TopBarProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
  absoluteCenter?: boolean;
  /** Desktop width of the absolutely-centered slot, in px. When set, the
   * search bar matches the page's content column width instead of the
   * 420px default. */
  centerWidth?: number;
}

function TopBar({ left, center, right, className = '', absoluteCenter = false, centerWidth }: TopBarProps) {
  const centerStyle = centerWidth
    ? ({ ['--topbar-center-width' as string]: `${centerWidth}px` } as CSSProperties)
    : undefined;
  return (
    <header className={`topbar ${className}`}>
      <div className="topbar-left">{left}</div>
      <div
        className={`topbar-center ${absoluteCenter ? 'topbar-center-absolute' : ''}`}
        style={centerStyle}
      >{center}</div>
      <div className="topbar-right">{right}</div>

      <style>{`
        .topbar {
          position: sticky;
          top: 0;
          background: white;
          height: 60px;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          z-index: 100;
          box-sizing: border-box;
          gap: 8px;
        }
        .topbar-left {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
          justify-content: flex-start;
          min-width: 0;
        }
        .topbar-center {
          flex: 1 1 auto;
          text-align: center;
          display: flex;
          justify-content: center;
          padding: 0;
          min-width: 0;
        }
        .topbar-search-wrap { width: 100%; }
        /* Desktop: absolutely center the search bar on the screen; it matches
           the page content column via the global --content-column-width token
           (or a per-page --topbar-center-width override). */
        .topbar-center-absolute { position: static; }
        @media (min-width: 768px) {
          .topbar-center-absolute {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            width: min(var(--topbar-center-width, var(--content-column-width)), 55vw);
            flex: none;
          }
        }
        .topbar-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex: 0 0 auto;
          gap: 8px;
        }
        .topbar-logo {
          display: flex;
          align-items: center;
          text-decoration: none;
        }
        .topbar-logo img {
          height: 36px;
          width: auto;
          display: block;
        }
        .topbar-back {
          color: #667eea;
          background: none;
          border: none;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          text-decoration: none;
        }
        .topbar-back:hover {
          color: #5a6fd6;
        }
        .topbar-signin {
          padding: 8px 16px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        .topbar-signin:hover {
          background: #5a6fd6;
        }
        .topbar-profile-link {
          display: block;
        }
        .topbar-profile-image {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
        }
        .topbar-profile-placeholder {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #e0e0e0;
        }
        .topbar-search-toggle {
          display: none;
          padding: 8px;
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
          border-radius: 8px;
        }
        .topbar-search-toggle:hover {
          background: #f5f5f5;
          color: #667eea;
        }
      `}</style>
    </header>
  );
}

export default TopBar;
