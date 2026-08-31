import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadSearchHistory,
  recordSearch,
  deleteSearch,
  toggleSaveSearch,
  getSearchHistoryId,
  type SearchEntry,
} from '../utils/searchHistory';

interface SearchBarProps {
  onSearch: (query: string) => void;
  value?: string;
  onChange?: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  onOptionsClick?: () => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
  /** Explicit shared history bucket id. When omitted, the bar derives one
   * from the signed-in email (or 'anon') so suggestions follow the user
   * on every page. */
  historyId?: string;
}

function SearchBar({ onSearch, value, onChange, autoFocus, placeholder, className, onOptionsClick, onInputFocus, onInputBlur, historyId }: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState('');
  const isControlled = value !== undefined;
  const query = isControlled ? value : internalQuery;

  const id = historyId ?? getSearchHistoryId();
  const [hist, setHist] = useState<SearchEntry[]>(() => loadSearchHistory(id));
  const [suggest, setSuggest] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowTouch = useRef<{ q: string; sx: number; sy: number } | null>(null);

  useEffect(() => {
    setHist(loadSearchHistory(id));
  }, [id]);

  const setQuery = (newValue: string) => {
    if (!isControlled) {
      setInternalQuery(newValue);
    }
    onChange?.(newValue);
  };

  const suggestions = useMemo(() => {
    const prefix = query.trim().toLowerCase();
    return hist
      .filter((e) => e.q.toLowerCase().startsWith(prefix))
      .sort((a, b) => (b.saved ? 1 : 0) - (a.saved ? 1 : 0) || b.at - a.at)
      .slice(0, 5);
  }, [hist, query]);

  const starActive = !!hist.find((e) => e.q === query.trim() && e.saved);

  const pick = (q: string) => {
    setQuery(q);
    setSuggest(false);
    setHist(recordSearch(id, q));
    onSearch(q);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setHist(recordSearch(id, q));
    setSuggest(false);
    onSearch(q);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    setSuggest(true);
    if (newValue === '') {
      onSearch('');
    }
  };

  const handleFocus = () => {
    setSuggest(true);
    onInputFocus?.();
  };

  const handleBlur = () => {
    // Delay so row taps (mousedown) land before the dropdown closes.
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setSuggest(false), 160);
    onInputBlur?.();
  };

  const toggleStar = () => {
    const q = query.trim();
    if (!q) return;
    setHist(toggleSaveSearch(id, q));
  };

  return (
    <form onSubmit={handleSubmit} className={`search-bar ${className || ''}`}>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={placeholder || 'Find people...'}
        className="search-input"
        autoFocus={autoFocus}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {query.trim() !== '' && (
        <button
          type="button"
          onClick={toggleStar}
          onMouseDown={(e) => e.preventDefault()}
          className={`search-star-btn ${starActive ? 'active' : ''}`}
          aria-label="Save search"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={starActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      )}
      {onOptionsClick && (
        <button type="button" onClick={onOptionsClick} className="search-options-btn" aria-label="Search options">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="2" y1="4.5" x2="14" y2="4.5" />
            <circle cx="6" cy="4.5" r="1.7" fill="currentColor" stroke="none" />
            <line x1="2" y1="8.5" x2="14" y2="8.5" />
            <circle cx="10" cy="8.5" r="1.7" fill="currentColor" stroke="none" />
            <line x1="2" y1="12.5" x2="14" y2="12.5" />
            <circle cx="5.5" cy="12.5" r="1.7" fill="currentColor" stroke="none" />
          </svg>
        </button>
      )}
      <button type="submit" className="search-button">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </button>

      {suggest && suggestions.length > 0 && (
        <div className="search-suggestions">
          {suggestions.map((s) => (
            <div
              key={s.q}
              className="search-suggestion"
              onTouchStart={(e) => {
                const t = e.touches[0];
                if (t) rowTouch.current = { q: s.q, sx: t.clientX, sy: t.clientY };
              }}
              onTouchEnd={(e) => {
                const g = rowTouch.current;
                rowTouch.current = null;
                if (!g || g.q !== s.q) return;
                const t = e.changedTouches[0];
                if (!t) return;
                const dx = t.clientX - g.sx;
                const dy = t.clientY - g.sy;
                // Swipe left/right deletes a NON-saved search
                if (!s.saved && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                  setHist(deleteSearch(id, s.q));
                }
              }}
            >
              <button className="suggestion-main" onMouseDown={(e) => { e.preventDefault(); pick(s.q); }}>
                {s.q}
              </button>
              {!s.saved && (
                <button
                  type="button"
                  className="suggestion-x"
                  aria-label="Delete search"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setHist(deleteSearch(id, s.q))}
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                className={`suggestion-star ${s.saved ? 'active' : ''}`}
                aria-label={s.saved ? 'Unsave search' : 'Save search'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setHist(toggleSaveSearch(id, s.q))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={s.saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .search-bar {
          position: relative;
          display: flex;
          align-items: center;
          background: #f5f5f5;
          border-radius: 8px;
          overflow: visible;
          width: 100%;
        }

        .search-input {
          flex: 1;
          min-width: 0;
          padding: 10px 12px;
          border: none;
          background: transparent;
          font-size: 14px;
          outline: none;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .search-input::placeholder {
          color: #999;
        }

        .search-star-btn {
          flex: 0 0 auto;
          padding: 10px 4px;
          background: transparent;
          border: none;
          color: #c4c8d0;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: color 0.15s;
        }
        .search-star-btn:hover { color: #f59e0b; }
        .search-star-btn.active { color: #f59e0b; }

        .search-options-btn {
          flex: 0 0 auto;
          padding: 10px 6px 10px 10px;
          background: transparent;
          border: none;
          color: #999;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .search-options-btn:hover { color: #667eea; }

        .search-button {
          flex: 0 0 auto;
          padding: 10px 10px;
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
        }

        .search-button:hover {
          color: #667eea;
        }

        .search-suggestions {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          z-index: 60;
          max-height: 260px;
          overflow-y: auto;
          padding: 4px 0;
        }

        .search-suggestion {
          display: flex;
          align-items: center;
          padding: 0;
        }

        .suggestion-main {
          flex: 1;
          min-width: 0;
          text-align: left;
          padding: 10px 12px;
          border: none;
          background: transparent;
          font-size: 14px;
          color: #333;
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .search-suggestion:hover { background: #f5f7ff; }

        .suggestion-x {
          flex: 0 0 auto;
          padding: 8px 6px;
          border: none;
          background: transparent;
          color: #c4c8d0;
          cursor: pointer;
          font-size: 13px;
        }
        .suggestion-x:hover { color: #dc2626; }

        .suggestion-star {
          flex: 0 0 auto;
          padding: 8px 10px 8px 4px;
          border: none;
          background: transparent;
          color: #c4c8d0;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .suggestion-star.active { color: #f59e0b; }
      `}</style>
    </form>
  );
}

export default SearchBar;