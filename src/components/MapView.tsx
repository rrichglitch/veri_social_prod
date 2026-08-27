import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapResult {
  type: 'person' | 'org';
  identity: string;
  orgId?: bigint;
  fullName: string;
  profilePicture: string;
  description: string;
  city: string;
  locationLat: number;
  locationLng: number;
}

interface MapViewProps {
  results: MapResult[];
  center?: { lat: number; lng: number };
  onResultClick: (r: MapResult) => void;
}

// Grid-cell clustering: max one marker per CELL_PX x CELL_PX pixels (hard cap per pixel area)
const CELL_PX = 44;

function MapView({ results, center, onResultClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const onResultClickRef = useRef(onResultClick);
  onResultClickRef.current = onResultClick;
  const draggingRef = useRef(false);
  const [activeCard, setActiveCard] = useState<{ result: MapResult; x: number; y: number } | null>(null);
  const activeCardRef = useRef(activeCard);
  activeCardRef.current = activeCard;

  // Simple model: card is open while hovered/tapped, marker present when not.
  // The card is centered exactly on its marker, so it covers the icon — no marker
  // opacity juggling needed. Closing is just clearing the card state.
  const closeCard = () => setActiveCard(null);

  const openCard = (r: MapResult, map: L.Map, lat: number, lng: number) => {
    // Don't open cards mid-pan: cursor sweeps across markers while dragging
    if (draggingRef.current) return;

    // Position: centered exactly on the icon; clamp so it never clips the screen
    const wrap = containerRef.current;
    if (!wrap) return;
    const pt = map.latLngToContainerPoint([lat, lng]);
    const CARD_W = 340;
    const CARD_H = 160;
    const pad = 8;
    let x = pt.x - CARD_W / 2;
    let y = pt.y - CARD_H / 2;
    x = Math.max(pad, Math.min(x, wrap.clientWidth - CARD_W - pad));
    y = Math.max(pad, Math.min(y, wrap.clientHeight - CARD_H - pad));
    setActiveCard({ result: r, x, y });
  };

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initCenter: [number, number] = center ? [center.lat, center.lng] : [39.5, -98.35]; // US default
    const map = L.map(containerRef.current, {
      center: initCenter,
      zoom: center ? 9 : 4,
      zoomControl: false,
    });
    // Humanitarian (HOT) style: keyless, pastel + zero label clutter — closest
    // keyless match to the old CARTO Voyager look.
    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Panning: close any open card and ignore hover-opens while dragging
    const onDragStart = () => {
      draggingRef.current = true;
      closeCard();
    };
    const onDragEnd = () => {
      draggingRef.current = false;
    };
    // Mobile: tapping anywhere on the map closes the card
    map.on('dragstart', onDragStart);
    map.on('dragend', onDragEnd);
    map.on('click', closeCard);

    return () => {
      map.off('dragstart', onDragStart);
      map.off('dragend', onDragEnd);
      map.off('click', closeCard);
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers on results / zoom change
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const withCoords = results.filter(r => r.locationLat !== undefined && r.locationLng !== undefined);
    if (withCoords.length === 0) return;

    // Always start at the active search location (user's saved location by default);
    // only fit the results when there is no location to center on.
    if (center) {
      map.setView([center.lat, center.lng], 10);
    } else {
      const bounds = L.latLngBounds(withCoords.map(r => [r.locationLat, r.locationLng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
    const zoom = map.getZoom();

    // Cluster by world-pixel grid at the current zoom
    const cells = new Map<string, MapResult[]>();
    for (const r of withCoords) {
      const pt = map.project([r.locationLat, r.locationLng], zoom);
      const key = `${Math.floor(pt.x / CELL_PX)}:${Math.floor(pt.y / CELL_PX)}`;
      const arr = cells.get(key);
      if (arr) arr.push(r);
      else cells.set(key, [r]);
    }

    for (const group of cells.values()) {
      const lat = group.reduce((s, r) => s + r.locationLat, 0) / group.length;
      const lng = group.reduce((s, r) => s + r.locationLng, 0) / group.length;
      if (group.length === 1) {
        const r = group[0];
        const icon = L.divIcon({
          className: '',
          html: `<div class="map-marker ${r.type === 'org' ? 'map-marker-org' : ''}" ${
            r.profilePicture ? `style="background-image:url('${r.profilePicture}')"` : ''
          }></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        L.marker([lat, lng], { icon })
          .on('mouseover', () => openCard(r, map, lat, lng))
          .on('click', () => openCard(r, map, lat, lng))
          .addTo(layer);
      } else {
        const icon = L.divIcon({
          className: '',
          html: `<div class="map-cluster">${group.length}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        L.marker([lat, lng], { icon })
          .bindTooltip(`${group.length} results`, { direction: 'top' })
          .on('click', () => map.setView([lat, lng], Math.min(zoom + 2, 18)))
          .addTo(layer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, center]);

  return (
    <div className="map-view-wrap">
      <div ref={containerRef} className="map-view" />
      {activeCard && (
        <div
          className="map-profile-card"
          style={{ left: activeCard.x, top: activeCard.y }}
          onMouseLeave={closeCard}
          onClick={() => onResultClickRef.current(activeCard.result)}
        >
          {activeCard.result.profilePicture ? (
            <img src={activeCard.result.profilePicture} alt={activeCard.result.fullName} className="mpc-pic" />
          ) : (
            <div className="mpc-pic mpc-pic-placeholder" />
          )}
          <div className="mpc-info">
            <h4 className="mpc-name">
              {activeCard.result.fullName}
              {activeCard.result.type === 'org' && <span className="mpc-org-badge">Organization</span>}
            </h4>
            {activeCard.result.description && <p className="mpc-desc">{activeCard.result.description}</p>}
          </div>
        </div>
      )}
      <style>{`
        .map-view-wrap { position: relative; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .map-view { height: 60vh; width: 100%; z-index: 1; }
        .map-view .leaflet-container { height: 100%; width: 100%; }
        .map-marker {
          width: 30px; height: 30px; border-radius: 50%;
          background: #667eea no-repeat center / cover;
          border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          box-sizing: border-box;
        }
        .map-marker-org { background-color: #22c55e; }
        .map-cluster {
          width: 30px; height: 30px; border-radius: 50%;
          background: #3730a3; color: white; font-weight: 700; font-size: 13px;
          display: flex; align-items: center; justify-content: center;
          border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          box-sizing: border-box;
        }
        .map-profile-card {
          position: absolute;
          width: 340px;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.25);
          z-index: 500;
          cursor: pointer;
          border: 1px solid #e5e7eb;
          box-sizing: border-box;
        }
        .mpc-pic { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .mpc-pic-placeholder { background: #e0e0e0; }
        .mpc-info { flex: 1; min-width: 0; }
        .mpc-name { margin: 0 0 6px; font-size: 20px; font-weight: 700; color: #333; }
        .mpc-org-badge { margin-left: 6px; padding: 2px 8px; background: #eef2ff; color: #3730a3; border-radius: 10px; font-size: 11px; font-weight: 600; vertical-align: middle; }
        .mpc-desc {
          margin: 0; font-size: 14px; color: #666; line-height: 1.4;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        }
      `}</style>
    </div>
  );
}

export default MapView;
