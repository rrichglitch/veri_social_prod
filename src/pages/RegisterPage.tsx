import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Turnstile } from '@marsidev/react-turnstile';
import { CHAR_LIMITS, MAX_MEDIA_SIZE_BYTES, ALLOWED_MEDIA_TYPES, TURNSTILE_SITE_KEY } from '../config';
import { useApp } from '../App';
import { fileToBase64, isFileSizeValid, isFileTypeValid, validateAndSanitizeCity, validateAndSanitizeDescription } from '../utils/sanitize';
import { isDisplayNameAcceptable } from '../utils/nameMatcher';
import { initiateDiditVerification, checkDiditVerification, createVerifiedProfile, updateLocation, getPendingRegistration } from '../utils/spacetime';
import { getBrowserLocation, jitterLocation, reverseGeocodeResilient } from '../utils/geo';
import { getOAuthSession } from '../utils/oauthSession';

const PENDING_REGISTRATION_KEY = 'pending_registration';

interface PendingRegistration {
  profilePicture: string;
  displayName: string;
  city: string;
  description: string;
}

function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { email, setHasProfile } = useApp();

  const diditSessionIdFromUrl = searchParams.get('verificationSessionId');
  const diditStatusFromUrl = searchParams.get('status');
  const diditSessionIdRef = useRef<string | null>(diditSessionIdFromUrl);

  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [storedPictureBase64, setStoredPictureBase64] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diditVerified, setDiditVerified] = useState(false);
  const [checkingDidit, setCheckingDidit] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [nameTooltipPinned, setNameTooltipPinned] = useState(false);
  const [nameTooltipHover, setNameTooltipHover] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [locStatus, setLocStatus] = useState<'idle' | 'fetching' | 'done' | 'error'>('idle');
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState('');
  const [locCoords, setLocCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  // On mount: restore pending registration from localStorage if present
  useEffect(() => {
    const stored = localStorage.getItem(PENDING_REGISTRATION_KEY);
    if (stored) {
      try {
        const parsed: PendingRegistration = JSON.parse(stored);
        setDisplayName(parsed.displayName || '');
        setCity(parsed.city);
        setDescription(parsed.description);
        if (parsed.profilePicture) {
          setPicturePreview(parsed.profilePicture);
          setStoredPictureBase64(parsed.profilePicture);
        }
      } catch (e) {
        console.error('Failed to restore pending registration:', e);
      }
    }

    // New OAuth users: prefill name and picture from the provider profile
    const oauthSession = getOAuthSession();
    if (oauthSession) {
      if (oauthSession.name) setFullName(oauthSession.name);
      if (oauthSession.picture && !storedPictureBase64) {
        setPicturePreview(oauthSession.picture);
        setStoredPictureBase64(oauthSession.picture);
      }
    }

    // RESUME: ask the backend whether this identity already has a pending
    // registration. An APPROVED verification jumps straight to "Confirm Your
    // Details" — no redoing ID verification. Best effort only.
    getPendingRegistration()
      .then((pending) => {
        if (!pending) return;
        if (pending.verified && pending.legalName) {
          setFullName(pending.legalName);
          if (pending.city) setCity(pending.city);
          if (pending.description) setDescription(pending.description);
          if (pending.profilePicture && !storedPictureBase64) {
            setPicturePreview(pending.profilePicture);
            setStoredPictureBase64(pending.profilePicture);
          }
          setDiditVerified(true);
          console.log('Resuming signup: identity verification already approved');
        }
      })
      .catch((e) => console.warn('Could not check pending registration:', e));
  }, []);

  // On mount: handle Didit callback
  useEffect(() => {
    const sessionId = diditSessionIdRef.current;
    if (!sessionId || diditVerified) return;

    const handleCallback = async () => {
      setCheckingDidit(true);
      setError(null);

      try {
        if (diditStatusFromUrl && diditStatusFromUrl.toUpperCase() !== 'APPROVED') {
          throw new Error(`Identity verification ${diditStatusFromUrl}. Please try again.`);
        }

        const result = await checkDiditVerification(sessionId);
        setFullName(result.fullName);
        // Keep the display name the user already typed; don't overwrite with legal name

        setDiditVerified(true);
        setCheckingDidit(false);
      } catch (err) {
        console.error('Didit callback error:', err);
        setError(err instanceof Error ? err.message : 'Identity verification failed');
        setCheckingDidit(false);
      }
    };

    handleCallback();
  }, [diditStatusFromUrl, diditVerified]);

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isFileTypeValid(file, [...ALLOWED_MEDIA_TYPES])) {
        setError('Invalid file type. Please upload an image.');
        return;
      }
      if (!isFileSizeValid(file, MAX_MEDIA_SIZE_BYTES)) {
        setError('File is too large. Maximum size is 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPicturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      const base64 = await fileToBase64(file);
      setStoredPictureBase64(base64);
      setError(null);
    }
  };

  const savePendingRegistration = () => {
    const pending: PendingRegistration = {
      profilePicture: storedPictureBase64 || '',
      displayName,
      city,
      description,
    };
    localStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify(pending));
  };

  const clearPendingRegistration = () => {
    localStorage.removeItem(PENDING_REGISTRATION_KEY);
  };

  const handleInitiateDidit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (!storedPictureBase64) {
        throw new Error('Profile picture is required');
      }
      if (!email) {
        throw new Error('Email not available. Please log in again.');
      }
      if (TURNSTILE_SITE_KEY && !turnstileToken) {
        throw new Error('Please complete the security check.');
      }

      const sanitizedCity = validateAndSanitizeCity(city);
      const sanitizedDescription = validateAndSanitizeDescription(description);

      // Save form data so it's available after redirect
      savePendingRegistration();

      const url = await initiateDiditVerification(
        email,
        storedPictureBase64,
        sanitizedCity,
        sanitizedDescription,
        turnstileToken
      );

      // Redirect to Didit hosted verification
      window.location.href = url;
    } catch (err) {
      console.error('Initiate Didit error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDisplayNameError(null);
    setIsLoading(true);

    try {
      const sessionId = diditSessionIdRef.current;
      if (!sessionId) {
        throw new Error('No verification session found. Please start identity verification.');
      }
      if (!storedPictureBase64) {
        throw new Error('Profile picture is required');
      }

      // Client-side display name validation
      const nameCheck = isDisplayNameAcceptable(displayName, fullName);
      if (!nameCheck.acceptable) {
        setDisplayNameError(nameCheck.reason ?? 'Invalid display name');
        setNameTooltipPinned(true);
        setIsLoading(false);
        return;
      }

      const sanitizedCity = validateAndSanitizeCity(city);
      const sanitizedDescription = validateAndSanitizeDescription(description);

      await createVerifiedProfile(
        sessionId,
        storedPictureBase64,
        sanitizedCity,
        sanitizedDescription,
        displayName,
        birthday,
        gender
      );

      // Store the approximate location (best effort — the profile already exists)
      const loc = locCoords;
      if (loc) {
        try {
          await updateLocation(loc.lat, loc.lng, 'approx');
        } catch (e) {
          console.warn('Failed to store location after registration:', e);
        }
      }

      clearPendingRegistration();

      // Clean up URL query params now that we're done
      window.history.replaceState({}, document.title, '/register');

      // Wait for subscription to sync
      await new Promise(resolve => setTimeout(resolve, 500));

      setHasProfile(true);
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('Create profile error:', err);
      const msg = err instanceof Error ? err.message : 'An error occurred';
      setError(msg);
      // If backend rejected the name, highlight the field too
      if (msg.toLowerCase().includes('name')) {
        setDisplayNameError(msg);
        setNameTooltipPinned(true);
      }
      setIsLoading(false);
    }
  };

  const handleAllowLocation = async () => {
    setLocStatus('fetching');
    setLocError(null);
    try {
      const pos = await getBrowserLocation();
      // Approximate precision: jittered ON DEVICE — exact position never leaves
      const jittered = jitterLocation(pos.lat, pos.lng, 5);
      setLocCoords(jittered);
      // City is derived from the location fix (no manual city entry).
      // Resilient path: Nominatim retry + independent fallback geocoder.
      const geocodedCity = await reverseGeocodeResilient(pos.lat, pos.lng);
      if (geocodedCity) {
        setCity(geocodedCity);
        setLocStatus('done');
      } else {
        setLocStatus('error');
        setLocError('Could not determine your city from your location. Please tap "Allow location" again.');
      }
    } catch (e: any) {
      setLocStatus('error');
      setLocError(
        e?.message === 'Geolocation not supported on this device'
          ? 'This device does not support location services, which are required to create an account.'
          : 'Location permission was not granted. Location is required to create an account — please allow it and try again.'
      );
    }
  };

  const handleRetry = () => {
    setDiditVerified(false);
    setFullName('');
    setDisplayNameError(null);
    setNameTooltipPinned(false);
    setNameTooltipHover(false);
    setError(null);
    setTurnstileToken('');
    diditSessionIdRef.current = null;
    window.history.replaceState({}, document.title, '/register');
  };

  if (checkingDidit) {
    return (
      <div className="register-page">
        <div className="register-container">
          <h1>Verifying Identity</h1>
          <p className="subtitle">Please wait while we confirm your identity verification...</p>
          <div className="loading-spinner" />
        </div>
        <style>{`
          .register-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
          }
          .register-container {
            background: white;
            border-radius: 16px;
            padding: 32px;
            width: 100%;
            max-width: 450px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            text-align: center;
          }
          h1 {
            margin: 0 0 8px;
            color: #333;
          }
          .subtitle {
            color: #666;
            margin: 0 0 24px;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #e0e0e0;
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="register-page">
      <div className="register-container">
        <h1>{diditVerified ? 'Confirm Your Details' : 'Create Account'}</h1>
        <p className="subtitle">
          {diditVerified
            ? 'Review your information and create your account'
            : 'Join Veri Social today'}
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={diditVerified ? handleCreateAccount : handleInitiateDidit} className="register-form">
          <div className="form-group">
            <label>Profile Picture *</label>
            <div className="picture-upload" onClick={() => fileInputRef.current?.click()}>
              {picturePreview ? (
                <img src={picturePreview} alt="Profile preview" className="preview" />
              ) : (
                <div className="upload-placeholder">
                  <span>Click to upload photo</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePictureChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div
            className="form-group"
            onMouseEnter={() => setNameTooltipHover(true)}
            onMouseLeave={() => setNameTooltipHover(false)}
          >
            <label htmlFor="displayName" className="label-with-info">
              <span>Display Name *</span>
              <span
                className="info-icon"
                onClick={() => setNameTooltipPinned(prev => !prev)}
              >
                &#9432;
              </span>
            </label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (displayNameError) setDisplayNameError(null);
              }}
              maxLength={CHAR_LIMITS.fullName}
              placeholder="Enter your display name"
              className={displayNameError ? 'input-error' : ''}
            />
            {(nameTooltipHover || nameTooltipPinned || displayNameError) && (
              <div className="name-tooltip">
                <p><strong>Name requirements:</strong></p>
                <ul>
                  <li>Must match your verified legal name</li>
                  <li>Your complete surname must be included</li>
                  <li>Middle names are optional</li>
                  <li>Common nicknames accepted (e.g. Mike &rarr; Michael, Mark &rarr; Markus)</li>
                  <li>Shortened forms accepted (e.g. John &rarr; Johnny)</li>
                </ul>
                {displayNameError && (
                  <p className="tooltip-error">{displayNameError}</p>
                )}
              </div>
            )}
            <span className="char-count">{displayName.length}/{CHAR_LIMITS.fullName}</span>
          </div>

          {diditVerified && (
            <div className="form-group">
              <label htmlFor="fullName">Legal Name</label>
              <input
                type="text"
                id="fullName"
                value={fullName}
                disabled
                className="disabled-input"
              />
              <span className="hint">Verified by Didit identity check</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="description">About You</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={CHAR_LIMITS.description}
              placeholder="Brief description or status"
              rows={3}
            />
            <span className="char-count">{description.length}/{CHAR_LIMITS.description}</span>
          </div>

          {!diditVerified && TURNSTILE_SITE_KEY && (
            <div className="form-group">
              <Turnstile
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={(token) => setTurnstileToken(token)}
                onError={() => {
                  setTurnstileToken('');
                  setError('Security check failed. Please try again.');
                }}
                onExpire={() => setTurnstileToken('')}
              />
            </div>
          )}

          {diditVerified ? (
            <>
              <div className="form-group">
                <label htmlFor="birthday">Birthday</label>
                <input
                  id="birthday"
                  type="date"
                  value={birthday}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setBirthday(e.target.value)}
                  required
                />
                <span className="hint">Your birthday is stored privately; only your age is shown to others.</span>
              </div>

              <div className="form-group">
                <label>Gender</label>
                <div className="register-gender-options">
                  {['male', 'female', 'other'].map((g) => (
                    <label key={g} className={`register-gender-option ${gender === g ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="register-gender"
                        value={g}
                        checked={gender === g}
                        onChange={() => setGender(g)}
                        required
                      />
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="location-box">
                <h4>Location required</h4>
                <p>
                  Your <strong>approximate</strong> location (accurate within 5 miles) is needed
                  once, when you create your account, to help people and organizations near you
                  find you. Your exact position is never shared — it is jittered on your device
                  before it is stored, and your city is set from your location.
                </p>
                <p className="location-sub">You can turn location off completely later in your profile settings.</p>
                {locStatus === 'done' ? (
                  <p className="location-ok">✓ Approximate location set — {city}</p>
                ) : locStatus === 'fetching' ? (
                  <p className="location-busy">Getting your approximate location…</p>
                ) : (
                  <>
                    <button type="button" onClick={handleAllowLocation} className="location-allow-btn">
                      Allow location
                    </button>
                    {locStatus === 'error' && locError && <p className="location-error">{locError}</p>}
                  </>
                )}
              </div>
              <button type="submit" className="submit-button" disabled={isLoading || locStatus !== 'done' || !birthday || !gender}>
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </button>
              <button type="button" onClick={handleRetry} className="back-button">
                Restart Verification
              </button>
            </>
          ) : (
            <button
              type="submit"
              className="submit-button"
              disabled={isLoading || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
            >
              {isLoading ? 'Starting Verification...' : 'Verify Identity with Didit'}
            </button>
          )}
        </form>

        <p className="login-link">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </div>

      <style>{`
        .register-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }

        .register-container {
          background: white;
          border-radius: 16px;
          padding: 32px;
          width: 100%;
          max-width: 450px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
          text-align: center;
          margin: 0 0 8px;
          color: #333;
        }

        .subtitle {
          text-align: center;
          color: #666;
          margin: 0 0 24px;
        }

        .error-message {
          background: #fee2e2;
          color: #dc2626;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .register-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        label {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .label-with-info {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .info-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #667eea;
          color: white;
          font-size: 12px;
          font-weight: bold;
          cursor: pointer;
          user-select: none;
        }

        .info-icon:hover {
          background: #5568d3;
        }

        input, textarea {
          padding: 12px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
          transition: border-color 0.2s;
        }

        input:focus, textarea:focus {
          outline: none;
          border-color: #667eea;
        }

        input.input-error {
          border-color: #dc2626;
          background: #fef2f2;
        }

        input.input-error:focus {
          border-color: #dc2626;
        }

        input.disabled-input {
          background: #f5f5f5;
          color: #333;
          cursor: not-allowed;
        }

        .name-tooltip {
          background: #f8f9fa;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 12px;
          font-size: 13px;
          color: #555;
        }

        .name-tooltip p {
          margin: 0 0 6px;
        }

        .name-tooltip ul {
          margin: 0;
          padding-left: 18px;
        }

        .name-tooltip li {
          margin-bottom: 4px;
        }

        .tooltip-error {
          color: #dc2626;
          font-weight: 600;
          margin-top: 8px !important;
        }

        .char-count, .hint {
          font-size: 12px;
          color: #999;
          text-align: right;
        }

        .hint {
          text-align: left;
        }

        .picture-upload {
          width: 120px;
          height: 120px;
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

        .upload-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
          color: #666;
          font-size: 14px;
          text-align: center;
        }

        .location-box { background: #f5f7ff; border: 1px solid #c7d2fe; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
        .location-box h4 { margin: 0 0 8px; color: #3730a3; font-size: 15px; }
        .location-box p { margin: 0 0 8px; color: #444; font-size: 13px; line-height: 1.5; }
        .location-box .location-sub { color: #888; font-size: 12px; }
        .location-allow-btn { padding: 10px 24px; background: #667eea; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .location-allow-btn:disabled { opacity: 0.6; cursor: default; }
        .register-gender-options { display: flex; gap: 8px; flex-wrap: wrap; }
        .register-gender-option {
          padding: 3px 3px; border: 1px solid #d1d5db; border-radius: 20px; cursor: pointer;
          font-size: 14px; font-weight: 600; color: #666; background: white;
        }
        .register-gender-option input { display: none; }
        .register-gender-option.selected { background: #667eea; border-color: #667eea; color: white; }
        .location-ok { color: #166534; font-weight: 600; }
        .location-busy { color: #667eea; }
        .location-error { color: #b91c1c; }
        .submit-button {
          padding: 14px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .submit-button:hover:not(:disabled) {
          background: #5568d3;
        }

        .submit-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .back-button {
          padding: 12px;
          background: transparent;
          color: #666;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .back-button:hover {
          background: #f5f5f5;
        }

        .login-link {
          text-align: center;
          margin-top: 20px;
          color: #666;
        }

        .login-link a {
          color: #667eea;
          text-decoration: none;
        }
      `}</style>
    </div>
  );
}

export default RegisterPage;
