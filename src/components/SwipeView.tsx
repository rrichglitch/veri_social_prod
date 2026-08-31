import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  checkIsFollowing, followUser, sendFriendRequest, getFriendRequestStatus, checkIsFriend,
  orgAccountIdentityHex, getDbConnection,
} from '../utils/spacetime';

export interface SwipeResult {
  type: 'person' | 'org';
  identity: string;
  orgId?: bigint;
  email: string;
  fullName: string;
  fullPicture?: string;
  profilePicture: string;
  city: string;
  description: string;
}

interface SwipeViewProps {
  results: SwipeResult[];
  myIdentity: string;     // hex identity of the viewer
  activeOrgId?: bigint;   // when signed in as an org, follow acts as the org
  isDesktop: boolean;
  onIndexChange?: (index: number) => void;
}

// Tinder/Bumble-style browsing: full-bleed profile previews, swipe (or
// horizontal scroll) to move between them, ‹ › carrots and peek cards on desktop.
function SwipeView({ results, myIdentity, activeOrgId, isDesktop, onIndexChange }: SwipeViewProps) {
  const navigate = useNavigate();
  const trackRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(0);
  const [contW, setContW] = useState(0);
  const [index, setIndex] = useState(0);
  const [infoH, setInfoH] = useState(0);
  const [scrim, setScrim] = useState(0.25); // 25% base → 40% when fully scrolled
  const [followStates, setFollowStates] = useState<Record<string, boolean>>({});
  const [friendStates, setFriendStates] = useState<Record<string, 'none' | 'pending' | 'friends'>>({});
  const infoRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const tapStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // Reset position only when the result SET genuinely changes (not on parent re-renders)
  const resultsSig = results.map((r) => `${r.type}:${r.identity}`).join('|');
  useEffect(() => {
    setIndex(0);
    setScrim(0.25);
    if (trackRef.current) trackRef.current.scrollLeft = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsSig]);

  useEffect(() => { onIndexChange?.(index); }, [index, onIndexChange]);

  // Measure card width: desktop shows peek cards on both sides, mobile is full-bleed
  useEffect(() => {
    const measure = () => {
      if (!trackRef.current) return;
      const w = trackRef.current.clientWidth;
      setContW(w);
      setCardW(isDesktop ? Math.min(520, Math.round(w * 0.72)) : w);
      // After the peek padding lands, recenter on the first card
      trackRef.current.scrollLeft = 0;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isDesktop]);

  // Measure the info block height (drives the scrim solid/fade split)
  useEffect(() => {
    if (!infoRef.current) return;
    const measure = () => setInfoH(infoRef.current?.offsetHeight || 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(infoRef.current);
    return () => ro.disconnect();
  }, [index, results]);

  // Follow + friend status polling for the current card.
  // The acting account is the org when signed in as one, else the individual;
  // the individual identity also falls back to the connection identity.
  const actingOrgHex = activeOrgId !== undefined ? orgAccountIdentityHex(activeOrgId) : null;
  // All candidate viewer identities: the org (when acting as one), the email-resolved
  // profile identity, and the connection identity — check state against each.
  const candidateViewerIds = [
    actingOrgHex,
    myIdentity,
    getDbConnection()?.identity?.toHexString() || '',
  ].filter(Boolean) as string[];
  const current = results[index];
  useEffect(() => {
    if (!current) return;
    let alive = true;
    const refresh = async () => {
      try {
        const results = await Promise.all(
          candidateViewerIds.map((id) => checkIsFollowing(current.identity, id))
        );
        if (alive) setFollowStates((s) => ({ ...s, [current.identity]: results.some(Boolean) }));
      } catch { /* ignore */ }
      if (current.type === 'person' && !actingOrgHex) {
        // Friendships only exist between individuals; org accounts can't friend
        const anyFriend = candidateViewerIds.some((id) => checkIsFriend(id, current.identity));
        const anyPending = candidateViewerIds.some(
          (id) => getFriendRequestStatus(id, current.identity) === 'pending'
        );
        if (alive) {
          setFriendStates((s) => ({
            ...s,
            [current.identity]: anyFriend ? 'friends' : anyPending ? 'pending' : 'none',
          }));
        }
      }
    };
    refresh();
    const t = setInterval(refresh, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [current?.identity, candidateViewerIds.join('|'), actingOrgHex]);

  // Mobile: one-card-per-swipe via controlled touch gestures (no native momentum,
  // so fast flicks can never skip cards). Description area keeps native vertical scroll.
  const touchRef = useRef<{ sx: number; sy: number; t0: number; sscroll: number; lx: number; lock: 'h' | 'v' | null } | null>(null);
  const swipeStateRef = useRef({ len: results.length, w: cardW, desktop: isDesktop });
  swipeStateRef.current = { len: results.length, w: cardW, desktop: isDesktop };
  useEffect(() => {
    const el = trackRef.current;
    if (!el || isDesktop) return;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      touchRef.current = { sx: t.clientX, sy: t.clientY, t0: performance.now(), sscroll: el.scrollLeft, lx: t.clientX, lock: null };
    };
    const onMove = (e: TouchEvent) => {
      const g = touchRef.current;
      if (!g) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - g.sx;
      const dy = t.clientY - g.sy;
      g.lx = t.clientX;
      if (!g.lock) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        const inDesc = (e.target as HTMLElement)?.closest?.('.swipe-desc') != null;
        g.lock = inDesc ? (Math.abs(dx) > Math.abs(dy) ? 'h' : 'v') : 'h';
      }
      if (g.lock === 'h') {
        e.preventDefault();
        el.scrollLeft = g.sscroll - dx;
      }
    };
    const onEnd = () => {
      const g = touchRef.current;
      touchRef.current = null;
      if (!g) return;
      const { len, w } = swipeStateRef.current;
      if (w === 0) return;
      const dx = g.lx - g.sx;
      const cur = Math.round(el.scrollLeft / w);
      const fling = performance.now() - g.t0 < 180 && Math.abs(dx) > 15;
      const target =
        dx < -50 || (fling && dx < 0) ? Math.min(len - 1, cur + 1) :
        dx > 50 || (fling && dx > 0) ? Math.max(0, cur - 1) : cur;
      el.scrollTo({ left: target * w, behavior: 'smooth' });
    };
    const onCancel = () => { touchRef.current = null; };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [isDesktop]);

  // Live index while scrolling + settle: snap to the nearest card after the
  // gesture ends (debounced) — reliable on wheel, trackpad, and touch.
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = useCallback(() => {
    if (!trackRef.current || cardW === 0) return;
    const el = trackRef.current;
    const i = Math.round(el.scrollLeft / cardW);
    if (i !== index && i >= 0 && i < results.length) {
      setIndex(i);
      setScrim(0.25);
      if (descRef.current) descRef.current.scrollTop = 0;
    }
    // Mobile snaps natively via CSS scroll-snap; only desktop needs the JS settle
    if (!isDesktop) {
      if (settleRef.current) clearTimeout(settleRef.current);
      return;
    }
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const target = Math.max(0, Math.min(results.length - 1, Math.round(el.scrollLeft / cardW)));
      el.scrollTo({ left: target * cardW, behavior: 'smooth' });
    }, 200);
  }, [cardW, index, results.length]);

  // Description scroll → scrim opacity 25% → 40% at full scroll
  const onDescScroll = () => {
    const el = descRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const progress = max > 0 ? Math.min(1, el.scrollTop / max) : 0;
    setScrim(0.25 + progress * 0.15);
  };

  // Desktop: vertical wheel over the card background pans horizontally.
  // The description keeps its own vertical scroll.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !isDesktop) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.swipe-desc')) return; // let the description scroll
      // Only vertical wheel input converts to horizontal paging; native
      // horizontal input (trackpad swipe) scrolls on its own.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;            // lines → pixels
      else if (e.deltaMode === 2) dy *= el.clientHeight; // pages → pixels
      el.scrollLeft += dy;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isDesktop, cardW]);

  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overscrollBounce = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // scrollLeft can't exceed the track bounds, so bounce the whole track visually
    if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
    el.style.transition = 'transform 0.18s ease-out';
    el.style.transform = `translateX(${dir === 1 ? -140 : 140}px)`;
    bounceTimerRef.current = setTimeout(() => {
      // Springy return that overshoots slightly past rest, like native rubber-banding
      el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
      el.style.transform = 'translateX(0px)';
      bounceTimerRef.current = setTimeout(() => {
        el.style.transition = '';
        el.style.transform = '';
      }, 520);
    }, 200);
  };

  const goTo = (i: number) => {
    if (i < 0 || i >= results.length) {
      overscrollBounce(i < 0 ? -1 : 1);
      return;
    }
    trackRef.current?.scrollTo({ left: i * cardW, behavior: 'smooth' });
    setIndex(i);
  };

  const openProfile = (r: SwipeResult) => {
    navigate(r.type === 'org' ? `/org/${r.orgId}` : `/profile/${r.identity}`);
  };

  // Tap anywhere on the card opens the profile (drags and buttons excluded)
  const handleCardTap = (r: SwipeResult) => (e: React.MouseEvent) => {
    const t = tapStartRef.current;
    if (!t) return;
    if (Math.abs(e.clientX - t.x) > 12 || Math.abs(e.clientY - t.y) > 12) return; // it was a drag
    if (Date.now() - t.t > 600) return; // long-press style drags
    openProfile(r);
  };

  const toggleFollow = async (r: SwipeResult) => {
    const was = followStates[r.identity];
    setFollowStates((s) => ({ ...s, [r.identity]: !was }));
    try {
      await followUser(r.identity, activeOrgId);
    } catch (err: any) {
      alert(err?.message || 'Failed to follow');
      setFollowStates((s) => ({ ...s, [r.identity]: was }));
    }
  };

  const sendFriend = async (r: SwipeResult) => {
    if (friendStates[r.identity] !== 'none') return;
    setFriendStates((s) => ({ ...s, [r.identity]: 'pending' }));
    try {
      await sendFriendRequest(r.identity, activeOrgId);
    } catch (err: any) {
      alert(err?.message || 'Failed to send friend request');
      setFriendStates((s) => ({ ...s, [r.identity]: 'none' }));
    }
  };

  const sc = scrim.toFixed(2);
  const scrimBg = (fade: boolean) =>
    fade
      ? `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,${sc}) 100%)`
      : `rgba(0,0,0,${sc})`;

  if (results.length === 0) return null;

  return (
    <div className="swipe-stage">
      {isDesktop && (
        <>
          <button className="swipe-carrot swipe-prev" onClick={() => goTo(index - 1)} aria-label="Previous">‹</button>
          <button className="swipe-carrot swipe-next" onClick={() => goTo(index + 1)} aria-label="Next">›</button>
        </>
      )}
      <div
        className="swipe-track"
        ref={trackRef}
        onScroll={onScroll}
        style={isDesktop && contW > cardW ? {
          padding: `0 ${Math.round((contW - cardW) / 2)}px`,
          scrollPaddingLeft: Math.round((contW - cardW) / 2),
          scrollPaddingRight: Math.round((contW - cardW) / 2),
        } : undefined}
      >
        {results.map((r, i) => (
          <div
            key={r.type === 'org' ? `org-${r.orgId}` : r.identity}
            className={`swipe-card ${i === index ? 'current' : 'dim'}`}
            style={{ width: cardW || undefined }}
            onPointerDown={(e) => { tapStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }; }}
            onClick={handleCardTap(r)}
          >
            {r.fullPicture || r.profilePicture ? (
              <img src={r.fullPicture || r.profilePicture} alt={r.fullName} className="swipe-bg" draggable={false} />
            ) : (
              <div className="swipe-bg-placeholder" />
            )}
            <div className="swipe-scrim-fade" style={{ bottom: infoH || undefined, background: scrimBg(true) }} />
            <div className="swipe-scrim-solid" style={{ height: infoH || undefined, background: scrimBg(false) }} />
            <div className="swipe-info" ref={i === index ? infoRef : undefined} style={{ minHeight: '25%' }}>
              <h2 className="swipe-name">
                {r.fullName}
                {r.type === 'org' && <span className="swipe-org-badge">Organization</span>}
              </h2>
              {r.city && <p className="swipe-city">{r.city}</p>}
              <div
                className="swipe-desc"
                ref={i === index ? descRef : undefined}
                onScroll={i === index ? onDescScroll : undefined}
              >
                {r.description || 'No description yet.'}
              </div>
              <div className="swipe-actions">
                <button
                  className={`swipe-follow ${followStates[r.identity] ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleFollow(r); }}
                >
                  {followStates[r.identity] ? 'Following' : 'Follow'}
                </button>
                {r.type === 'person' && !actingOrgHex && (
                  <button
                    className={`swipe-friend ${friendStates[r.identity] === 'pending' || friendStates[r.identity] === 'friends' ? 'active' : ''}`}
                    disabled={friendStates[r.identity] !== 'none'}
                    onClick={(e) => { e.stopPropagation(); sendFriend(r); }}
                  >
                    {friendStates[r.identity] === 'friends' ? 'Friends' : friendStates[r.identity] === 'pending' ? 'Requested' : 'Add Friend'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {isDesktop && contW > cardW && (
          <div className="swipe-spacer" style={{ flex: `0 0 ${Math.round((contW - cardW) / 2)}px` }} />
        )}
      </div>
      <style>{`
        .swipe-stage { position: absolute; inset: 0; overflow: hidden; background: #f5f5f5; }
        .swipe-track {
          display: flex; height: 100%; overflow-x: auto;
          scrollbar-width: none; -ms-overflow-style: none; box-sizing: border-box;
        }
        .swipe-track::-webkit-scrollbar { display: none; }
        .swipe-card {
          position: relative; flex: 0 0 auto; height: 100%; scroll-snap-align: start;
          overflow: hidden; cursor: pointer; transition: filter 0.25s;
        }
        .swipe-card.dim { filter: brightness(0.35) saturate(0.7); }
        .swipe-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; user-select: none; }
        .swipe-bg-placeholder { position: absolute; inset: 0; background: linear-gradient(135deg, #334155, #1e293b); }
        .swipe-scrim-fade {
          position: absolute; left: 0; right: 0; height: 25%; pointer-events: none;
        }
        .swipe-scrim-solid { position: absolute; left: 0; right: 0; bottom: 0; pointer-events: none; }
        .swipe-info {
          position: absolute; left: 0; right: 0; bottom: 0; box-sizing: border-box;
          display: flex; flex-direction: column; padding: 16px 20px 24px; color: white;
        }
        .swipe-name { margin: 0 0 2px; font-size: 28px; font-weight: 700; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
        .swipe-org-badge {
          display: inline-block; margin-left: 8px; padding: 2px 10px; font-size: 11px; font-weight: 600;
          background: rgba(102,126,234,0.9); border-radius: 20px; vertical-align: middle;
        }
        .swipe-city { margin: 0 0 8px; font-size: 14px; color: rgba(255,255,255,0.85); }
        .swipe-desc {
          max-height: 30vh; overflow-y: auto; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,0.92);
          overscroll-behavior: contain; scrollbar-width: thin;
        }
        .swipe-desc::-webkit-scrollbar { width: 4px; }
        .swipe-desc::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.4); border-radius: 2px; }
        .swipe-actions { display: flex; gap: 10px; margin-top: 14px; }
        .swipe-follow, .swipe-friend {
          padding: 10px 24px; border-radius: 24px; font-size: 15px; font-weight: 600; cursor: pointer;
          border: none; transition: background 0.15s, color 0.15s, opacity 0.15s;
        }
        .swipe-follow { background: white; color: #667eea; }
        .swipe-follow.active { background: #667eea; color: white; }
        .swipe-friend { background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.5); }
        .swipe-friend.active { background: #22c55e; border-color: #22c55e; }
        .swipe-friend:disabled { opacity: 0.8; cursor: default; }
        .swipe-carrot {
          position: absolute; top: 50%; transform: translateY(-50%); z-index: 5;
          width: 144px; height: 144px; background: none; border: none; cursor: pointer;
          color: white; font-size: 128px; line-height: 1;
          text-shadow: 0 2px 14px rgba(0,0,0,0.55);
          display: flex; align-items: center; justify-content: center;
        }
        .swipe-carrot:hover { color: #e8e8e8; }
        .swipe-prev { left: 24px; }
        .swipe-next { right: 24px; }
        @media (max-width: 767px) {
          .swipe-carrot { display: none; }
          .swipe-desc { max-height: 26vh; }
          /* Mobile: one-card-per-swipe is handled by controlled touch gestures;
             vertical panning stays native so long descriptions scroll smoothly */
          .swipe-track { touch-action: pan-y; }
        }
      `}</style>
    </div>
  );
}

export default SwipeView;
