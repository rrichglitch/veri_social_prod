import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getOAuthSession } from '../utils/oauthSession';
import { AUTH_RELAY_URL } from '../config';

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  useEffect(() => {
    if (getOAuthSession()) {
      navigate(from, { replace: true });
    }
  }, [from, navigate]);

  const startOAuth = (provider: 'google' | 'facebook') => {
    const app = window.location.origin;
    window.location.href = `${AUTH_RELAY_URL}/auth/${provider}?app=${encodeURIComponent(app)}`;
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Veri Social</h1>
        <p className="tagline">What others say about you matters</p>

        <div className="login-form">
          <button onClick={() => startOAuth('google')} className="login-button oauth google">
            <svg className="oauth-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.1 3.57-5.17 3.57-8.81z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l4.01-3.1z" />
              <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44A12 12 0 0 0 1.27 6.6l4.01 3.1c.94-2.84 3.59-4.93 6.72-4.93z" />
            </svg>
            Continue with Google
          </button>

          <button
            onClick={() => startOAuth('facebook')}
            disabled
            className="login-button oauth facebook disabled"
            title="Facebook sign-in is not available yet"
          >
            <svg className="oauth-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.93-1.95 1.87V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12z" />
            </svg>
            Continue with Facebook
          </button>
        </div>

        <p className="terms">
          By signing in, you agree to our terms of service and privacy policy.
        </p>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }

        .login-container {
          background: white;
          border-radius: 16px;
          padding: 48px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          box-sizing: border-box;
        }

        h1 {
          text-align: center;
          margin: 0 0 8px;
          color: #333;
          font-size: 28px;
        }

        .tagline {
          text-align: center;
          color: #666;
          margin: 0 0 32px;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .login-button {
          padding: 13px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
          text-decoration: none;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: none;
        }

        .oauth-icon {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }

        .login-button.oauth {
          background: white;
          color: #333;
          border: 1.5px solid #dadce0;
        }

        .login-button.oauth:hover {
          background: #f7f8fa;
          border-color: #c6c9ce;
        }

        .login-button.disabled {
          opacity: 0.45;
          filter: grayscale(0.9);
          cursor: not-allowed;
          pointer-events: none;
        }

        .divider span {
          padding: 0 16px;
          color: #999;
          font-size: 14px;
        }

        .terms {
          text-align: center;
          margin-top: 12px;
          font-size: 12px;
          color: #999;
        }
      `}</style>
    </div>
  );
}

export default LoginPage;