import { useRef, useState, type ReactNode } from 'react';

interface ProfileDetailsProps {
  picture: string;
  name: string;
  city: string;
  description: string;
  age?: number;             // computed server-side; birthdays never reach clients
  gender?: string;          // 'male' | 'female' | 'other'
  onUpdateLocation: () => void;
  isLocationUpdating?: boolean;
  onSaveDescription: (value: string) => Promise<void>;
  onSaveAgeGender?: (birthday: string | undefined, gender: string | undefined) => Promise<void>;
  onPictureClick?: () => void;
  pictureExtra?: ReactNode; // e.g. the Share button under the picture
  showLocationUpdate?: boolean; // default true
  children?: ReactNode;     // extra lines between Location and the description (join date, badges)
  footer?: ReactNode;       // extra items at the very bottom of the info section (back button)
}

// Shared profile header for individual and org accounts — the SINGLE source of
// truth for the top info section: picture | name, Location + Update, extra
// children, editable description, footer. Both profile pages render exactly this.
function ProfileDetails({
  picture, name, city, description, age, gender,
  onUpdateLocation, isLocationUpdating, onSaveDescription, onSaveAgeGender,
  onPictureClick, pictureExtra, showLocationUpdate = true, children, footer,
}: ProfileDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = () => {
    setEditValue(description || '');
    setIsEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const saveEdit = async () => {
    setIsSaving(true);
    try {
      await onSaveDescription(editValue.trim());
      setIsEditing(false);
      setEditValue('');
    } catch (e: any) {
      alert(e?.message || 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Age (derived from the stored birthday) is NOT updateable — the birthday is
  // set once at registration. Only gender is editable here.
  const [isEditingAge, setIsEditingAge] = useState(false);
  const [ageGender, setAgeGender] = useState('');

  const startAgeEdit = () => {
    setAgeGender(gender || '');
    setIsEditingAge(true);
  };

  const saveAgeEdit = async () => {
    if (!onSaveAgeGender) return;
    setIsSaving(true);
    try {
      await onSaveAgeGender(undefined, ageGender || undefined);
      setIsEditingAge(false);
    } catch (e: any) {
      alert(e?.message || 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const ageLine = [age !== undefined ? `${age}` : '', gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : '']
    .filter(Boolean)
    .join(' · ');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  return (
    <div className="profile-header">
      <div className="profile-pic-wrapper">
        <div className="profile-picture-container">
          {picture ? (
            <img
              src={picture}
              alt={name}
              className={`profile-picture${onPictureClick ? ' clickable' : ''}`}
              onClick={onPictureClick}
            />
          ) : (
            <div className={`profile-picture-placeholder${onPictureClick ? ' clickable' : ''}`} onClick={onPictureClick} />
          )}
        </div>
        {pictureExtra}
      </div>
      <div className="profile-info">
        <h2 className="profile-name">{name}</h2>
        <div className="profile-field">
          <div className="field-display">
            <span className="field-label">Location:</span>
            <span className="field-value">{city || '—'}</span>
            {showLocationUpdate && (
              <button className="loc-update-btn" onClick={onUpdateLocation} disabled={isLocationUpdating}>
                {isLocationUpdating ? 'Updating…' : 'Update'}
              </button>
            )}
          </div>
        </div>
        {(ageLine || onSaveAgeGender || children) && (
          <div className="profile-field">
            {isEditingAge ? (
              <div className="edit-inline">
                <div className="gender-options">
                  {['male', 'female', 'other'].map((g) => (
                    <label key={g} className={`gender-option ${ageGender === g ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="gender-edit"
                        value={g}
                        checked={ageGender === g}
                        onChange={() => setAgeGender(g)}
                      />
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </label>
                  ))}
                  <div className="edit-actions">
                    <button onClick={saveAgeEdit} className="save-btn" disabled={isSaving}>✓</button>
                    <button onClick={() => setIsEditingAge(false)} className="cancel-btn">✕</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="field-display">
                {ageLine && <span className="field-value age-line">{ageLine}</span>}
                {onSaveAgeGender && (
                  <button className="edit-btn" onClick={startAgeEdit} disabled={isSaving}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
                {children}
              </div>
            )}
          </div>
        )}
        <div className="profile-field description-field">
          {isEditing ? (
            <div className="edit-inline">
              <textarea
                ref={editInputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="edit-textarea"
                placeholder="Description"
                rows={3}
              />
              <div className="edit-actions">
                <button onClick={saveEdit} className="save-btn" disabled={isSaving}>
                  ✓
                </button>
                <button onClick={cancelEdit} className="cancel-btn">
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <div className="field-display">
              <span className="field-value">{description || 'Add description'}</span>
              <button className="edit-btn" onClick={startEdit} disabled={isSaving}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {footer}
      </div>
      <style>{`
        /* ── Top info section — shared by individual AND org profiles ── */
        .profile-header { display: flex; gap: 20px; align-items: flex-start; }
        .profile-pic-wrapper { display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .profile-picture-container { position: relative; flex-shrink: 0; }
        .profile-picture { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; }
        .profile-picture.clickable, .profile-picture-placeholder.clickable { cursor: pointer; transition: transform 0.2s; }
        .profile-picture.clickable:hover, .profile-picture-placeholder.clickable:hover { transform: scale(1.05); }
        .profile-picture-placeholder { width: 100px; height: 100px; border-radius: 50%; background: #e0e0e0; }
        .profile-info { flex: 1; min-width: 0; }
        .profile-name { margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #333; }
        .profile-field { margin: 4px 0 8px; }
        .field-display { display: flex; align-items: center; gap: 8px; }
        .field-label { color: #999; font-size: 14px; font-weight: 500; }
        .field-value { color: #666; font-size: 14px; }
        .description-field .field-value { display: block; white-space: pre-wrap; font-size: 13px; color: #666; line-height: 1.4; }
        .edit-btn { background: none; border: none; color: #999; cursor: pointer; padding: 2px; display: flex; align-items: center; opacity: 0; transition: opacity 0.2s; }
        .profile-field:hover .edit-btn { opacity: 1; }
        .edit-btn:hover { color: #667eea; }
        .edit-inline { display: flex; flex-direction: column; gap: 8px; width: 100%; }
        .edit-textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #667eea; border-radius: 4px; font-size: 14px; font-family: inherit; resize: vertical; outline: none; }
        .edit-actions { display: flex; gap: 8px; }
        .age-line { font-size: 14px; color: #666; }
        .gender-options { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .gender-option {
          padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 20px; cursor: pointer;
          font-size: 13px; font-weight: 600; color: #666; background: white;
        }
        .gender-option input { display: none; }
        .gender-option.selected { background: #667eea; border-color: #667eea; color: white; }
        .save-btn { padding: 4px 8px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .save-btn:hover { background: #5a6fd6; }
        .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cancel-btn { padding: 4px 8px; background: #999; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .cancel-btn:hover { background: #777; }

        /* ── Outline pill buttons (Share / Update / Back to my account) ──
           White with blue border+text; fill solid blue on hover. */
        .share-btn-under-pic, .loc-update-btn, .back-to-account-btn {
          background: white;
          color: #667eea;
          border: 1px solid #667eea;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 6px 16px;
          white-space: nowrap;
          transition: background 0.15s, color 0.15s;
        }
        .share-btn-under-pic:hover, .loc-update-btn:hover, .back-to-account-btn:hover { background: #667eea; color: white; }
        .loc-update-btn { margin-left: 8px; padding: 3px 10px; }
        .loc-update-btn:disabled { opacity: 0.6; cursor: default; }

        @media (max-width: 767px) {
          .profile-header { flex-direction: column; align-items: center; text-align: center; }
          .profile-field { justify-content: center; }
          .field-display { justify-content: center; flex-wrap: wrap; }
          .profile-picture, .profile-picture-placeholder { width: 80px; height: 80px; }
          .profile-name { font-size: 19px; }
        }
      `}</style>
    </div>
  );
}

export default ProfileDetails;
