import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApp } from '../App';
import { followUser } from '../utils/spacetime';

function FollowPage() {
  const { ownerIdentity } = useParams<{ ownerIdentity: string }>();
  const navigate = useNavigate();
  const { identity } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleFollow = async () => {
    if (!identity) {
      localStorage.setItem('pending_follow', ownerIdentity!);
      navigate('/login', { state: { from: { pathname: '/' } } });
      return;
    }

    const currentIdentityHex = identity.toHexString();

    if (currentIdentityHex === ownerIdentity) {
      setError("You can't follow yourself");
      setIsLoading(false);
      return;
    }

    try {
      console.log('Following:', ownerIdentity);
      await followUser(ownerIdentity!);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to follow');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (ownerIdentity) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleFollow();
    }
  }, [ownerIdentity, identity]);

  if (isLoading) {
    return (
      <div className="follow-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Following...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="follow-page">
        <div className="error-container">
          <h2>Error</h2>
          <p>{error}</p>
          <Link to="/">Go Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="follow-page">
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Following...</p>
      </div>

      <style>{`
        .follow-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
        }

        .loading-container, .error-container {
          text-align: center;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e0e0e0;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-container h2 {
          color: #dc2626;
          margin-bottom: 8px;
        }

        .error-container a {
          display: inline-block;
          margin-top: 16px;
          padding: 10px 20px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
}

export default FollowPage;
