// Shared full-size picture viewer: the 10KB thumbnail renders everywhere;
// clicking a profile picture opens THIS with the full-size image (S3 URL or
// legacy base64). One implementation, used by ProfileHeader + ProfileDetails.
interface PictureZoomProps {
  src: string;
  name?: string;
  onClose: () => void;
}

function PictureZoom({ src, name, onClose }: PictureZoomProps) {
  return (
    <div className="pic-zoom" onClick={onClose}>
      <img src={src} alt={name || 'Full size picture'} className="pic-zoom-img" />
      <style>{`
        .pic-zoom {
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.9);
          display: flex; align-items: center; justify-content: center;
          z-index: 600; cursor: zoom-out; padding: 16px;
        }
        .pic-zoom-img {
          max-width: min(92vw, 1000px); max-height: 92vh;
          border-radius: 8px; object-fit: contain; cursor: default;
          background: #111;
        }
      `}</style>
    </div>
  );
}

export default PictureZoom;