import { useEffect, useRef, useState } from 'react';
import { getGallery, deleteGalleryPhoto, uploadGalleryPhoto, type GalleryPhoto } from '../utils/spacetime';
import { fetchProfileGallery, refreshFetchedGallery } from '../utils/clientData';
import { compressGalleryImage } from '../utils/imageCompress';
import { GALLERY_MAX_PHOTOS } from '../config';

interface GalleryProps {
  /** Identity owning the gallery (individual identity hex or org account hex). */
  ownerIdentityHex: string;
  /** Own view: shows upload tile + per-photo delete. */
  isOwn: boolean;
  /** When uploading to an org gallery: the org id + account identity hex. */
  actingAsOrgId?: bigint;
  actingAsOrgIdentityHex?: string;
}

// Instagram-style photo grid shown directly under the profile top info
// section. Shared by individuals, orgs, own view and others' view.
function Gallery({ ownerIdentityHex, isOwn, actingAsOrgId, actingAsOrgIdentityHex }: GalleryProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>(() => getGallery(ownerIdentityHex));
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<GalleryPhoto | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOwn) {
      const update = () => setPhotos(getGallery(ownerIdentityHex));
      update();
      const interval = setInterval(update, 2500);
      return () => clearInterval(interval);
    }
    // Other people's galleries: fetched on demand (memoized); poll refreshes
    // by invalidating first so new uploads/deletes appear while open.
    let alive = true;
    const update = async () => {
      refreshFetchedGallery(ownerIdentityHex);
      const rows = (await fetchProfileGallery(ownerIdentityHex)) as GalleryPhoto[];
      if (alive) setPhotos(rows);
    };
    update();
    const interval = setInterval(update, 5000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [ownerIdentityHex, isOwn]);

  const remaining = GALLERY_MAX_PHOTOS - photos.length;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!isOwn) return;
    setBusy(true);
    setUploadError(null);
    try {
      const list = Array.from(files).slice(0, remaining);
      for (const file of list) {
        try {
          const blob = await compressGalleryImage(file);
          await uploadGalleryPhoto(blob, actingAsOrgId, actingAsOrgIdentityHex);
        } catch (e: any) {
          setUploadError(e?.message || 'Failed to upload one of the photos');
          break;
        }
      }
      // Subscription sync updates the grid; refresh immediately too.
      setTimeout(() => setPhotos(getGallery(ownerIdentityHex)), 400);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (photo: GalleryPhoto) => {
    if (!isOwn || deleting) return;
    setDeleting(photo.id.toString());
    try {
      await deleteGalleryPhoto(photo, actingAsOrgId, actingAsOrgIdentityHex);
      setPhotos(getGallery(ownerIdentityHex));
      if (lightbox?.id === photo.id) setLightbox(null);
    } catch (e: any) {
      alert(e?.message || 'Failed to delete photo');
    } finally {
      setDeleting(null);
    }
  };

  if (photos.length === 0 && !isOwn) return null;

  return (
    <div className={`gallery-section ${photos.length === 0 ? 'gallery-empty' : ''}`}>
      <div className="gallery-head">
        <h3 className="gallery-title">Photos</h3>
        {isOwn && (
          <span className="gallery-sub">Add up to {GALLERY_MAX_PHOTOS} photos.</span>
        )}
        {isOwn && photos.length === 0 && (
          <button
            type="button"
            className="gallery-first-btn"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Uploading…' : 'Add your first photo.'}
          </button>
        )}
        {isOwn && photos.length > 0 && (
          <span className="gallery-count">{photos.length}/{GALLERY_MAX_PHOTOS}</span>
        )}
      </div>

      {uploadError && <p className="gallery-error">{uploadError}</p>}

      {photos.length > 0 && (
        <div className="gallery-grid">
        {photos.map((photo) => (
          <div key={photo.id.toString()} className={`gallery-cell ${deleting === photo.id.toString() ? 'deleting' : ''}`}>
            <img
              src={photo.url}
              alt="Gallery photo"
              loading="lazy"
              className="gallery-img"
              onClick={() => setLightbox(photo)}
            />
            {isOwn && (
              <button
                type="button"
                className="gallery-del"
                onClick={() => handleDelete(photo)}
                disabled={deleting !== null}
                aria-label="Remove photo"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {isOwn && remaining > 0 && (
          <button
            type="button"
            className="gallery-add"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Uploading…' : '+'}
          </button>
        )}
        </div>
      )}

      {isOwn && remaining > 0 && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />
      )}

      {lightbox && (
        <div className="gallery-lightbox" onClick={() => setLightbox(null)}>
          <div className="gallery-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt="Gallery photo" className="gallery-lightbox-img" />
            <div className="gallery-lightbox-bar">
              <button onClick={() => setLightbox(null)} className="gallery-lb-close">Close</button>
              {isOwn && (
                <button
                  onClick={() => handleDelete(lightbox)}
                  className="gallery-lb-del"
                  disabled={deleting !== null}
                >
                  {deleting === lightbox.id.toString() ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .gallery-section {
          background: white;
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .gallery-head {
          display: flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .gallery-title { margin: 0; font-size: 16px; color: #333; }
        .gallery-sub { font-size: 13px; color: #999; }
        .gallery-count { margin-left: auto; font-size: 13px; color: #999; font-weight: 600; }
        .gallery-first-btn {
          margin-left: auto;
          background: none; border: none; padding: 0; color: #667eea;
          font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: underline;
        }
        .gallery-first-btn:disabled { opacity: 0.6; cursor: default; }
        /* Collapsed empty state: no grid below the head, so drop the head's
           bottom margin to keep the card's vertical padding symmetric. */
        .gallery-empty .gallery-head { margin-bottom: 0; }
        .gallery-error { margin: 0 0 10px; color: #dc2626; font-size: 13px; }
        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
        }
        .gallery-cell { position: relative; aspect-ratio: 1 / 1; overflow: hidden; border-radius: 4px; }
        .gallery-cell.deleting { opacity: 0.5; pointer-events: none; }
        .gallery-img {
          width: 100%; height: 100%; object-fit: cover; cursor: pointer; display: block;
          background: #f0f0f0;
        }
        .gallery-del {
          position: absolute; top: 6px; right: 6px;
          width: 26px; height: 26px; border-radius: 50%;
          background: rgba(0,0,0,0.55); color: white; border: none;
          font-size: 14px; line-height: 1; cursor: pointer; display: flex;
          align-items: center; justify-content: center;
        }
        .gallery-del:hover { background: #dc2626; }
        .gallery-add {
          aspect-ratio: 1 / 1; border-radius: 4px;
          border: 2px dashed #c7d2fe; background: #f8faff; color: #667eea;
          font-size: 28px; font-weight: 400; cursor: pointer; display: flex;
          align-items: center; justify-content: center; transition: background 0.15s;
        }
        .gallery-add:hover:not(:disabled) { background: #eef2ff; }
        .gallery-add:disabled { opacity: 0.6; cursor: default; }
        .gallery-lightbox {
          position: fixed; inset: 0; background: rgba(0,0,0,0.85);
          display: flex; align-items: center; justify-content: center; z-index: 500;
        }
        .gallery-lightbox-content {
          max-width: min(92vw, 1000px); max-height: 92vh; display: flex;
          flex-direction: column; align-items: center; gap: 10px;
        }
        .gallery-lightbox-img {
          max-width: 100%; max-height: 84vh; border-radius: 8px; object-fit: contain;
        }
        .gallery-lightbox-bar { display: flex; gap: 10px; }
        .gallery-lb-close, .gallery-lb-del {
          padding: 8px 18px; border: none; border-radius: 8px; font-size: 14px;
          font-weight: 600; cursor: pointer;
        }
        .gallery-lb-close { background: #667eea; color: white; }
        .gallery-lb-close:hover { background: #5568d3; }
        .gallery-lb-del { background: #dc2626; color: white; }
        .gallery-lb-del:hover { background: #b91c1c; }
        .gallery-lb-del:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </div>
  );
}

export default Gallery;