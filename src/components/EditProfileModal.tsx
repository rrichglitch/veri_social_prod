import { useState, useRef, useEffect } from 'react';
import { CHAR_LIMITS, MAX_MEDIA_SIZE_BYTES, ALLOWED_MEDIA_TYPES } from '../config';
import { fileToBase64, isFileSizeValid, isFileTypeValid } from '../utils/sanitize';
import { updateProfile } from '../utils/spacetime';

interface UserProfile {
  identity: string;
  full_name: string;
  profile_picture: string;
  city: string;
  description: string;
  created_at: Date;
}

interface EditProfileModalProps {
  profile: UserProfile;
  onClose: () => void;
  onSave: (updatedProfile: UserProfile) => void;
}

function EditProfileModal({ profile, onClose, onSave }: EditProfileModalProps) {
  const [city, setCity] = useState(profile.city);
  const [description, setDescription] = useState(profile.description);
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string>(profile.profile_picture);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handlePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isFileTypeValid(file, [...ALLOWED_MEDIA_TYPES])) {
        setError('Invalid file type');
        return;
      }
      if (!isFileSizeValid(file, MAX_MEDIA_SIZE_BYTES)) {
        setError('File is too large');
        return;
      }
      setProfilePicture(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPicturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      let pictureData: string | undefined;

      if (profilePicture) {
        pictureData = await fileToBase64(profilePicture);
      }

      // Call update_profile reducer
      console.log('Updating profile:', { city, description, profilePicture: pictureData });
      
      await updateProfile(
        pictureData,
        city || undefined,
        description || undefined
      );

      // Wait for subscription sync
      await new Promise(resolve => setTimeout(resolve, 500));

      onSave({
        ...profile,
        city,
        description,
        profile_picture: pictureData || profile.profile_picture,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Edit Profile</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Profile Picture</label>
            <div className="picture-upload" onClick={() => fileInputRef.current?.click()}>
              <img src={picturePreview} alt="Preview" className="preview" />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePictureChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Full Name</label>
            <input type="text" value={profile.full_name} disabled className="disabled-input" />
            <span className="help-text">Name cannot be changed</span>
          </div>

          <div className="form-group">
            <label htmlFor="city">City</label>
            <input
              type="text"
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={CHAR_LIMITS.city}
            />
            <span className="char-count">{city.length}/{CHAR_LIMITS.city}</span>
          </div>

          <div className="form-group">
            <label htmlFor="description">About You</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={CHAR_LIMITS.description}
              rows={3}
            />
            <span className="char-count">{description.length}/{CHAR_LIMITS.description}</span>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="save-button">
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-content {
          background: white;
          border-radius: 16px;
          padding: 24px;
          width: 100%;
          max-width: 400px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-content h2 {
          margin: 0 0 20px;
          color: #333;
        }

        .error-message {
          background: #fee2e2;
          color: #dc2626;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .form-group input, .form-group textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
        }

        .form-group input:focus, .form-group textarea:focus {
          outline: none;
          border-color: #667eea;
        }

        .form-group input.disabled-input {
          background: #f5f5f5;
          color: #999;
        }

        .help-text {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #999;
        }

        .char-count {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #999;
          text-align: right;
        }

        .picture-upload {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          overflow: hidden;
          cursor: pointer;
          margin: 0 auto;
          border: 3px solid #e0e0e0;
        }

        .picture-upload img.preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 24px;
        }

        .cancel-button {
          padding: 10px 20px;
          background: white;
          color: #666;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          cursor: pointer;
        }

        .save-button {
          padding: 10px 20px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }

        .save-button:disabled {
          background: #ccc;
        }
      `}</style>
    </div>
  );
}

export default EditProfileModal;
