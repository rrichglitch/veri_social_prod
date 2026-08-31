import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import SearchBar from '../components/SearchBar';
import AuthActions from '../components/AuthActions';
import { useAuthProfile } from '../hooks/useAuthProfile';

function AboutPage() {
  const navigate = useNavigate();
  const [searchQ, setSearchQ] = useState('');
  const { isLoggedIn } = useAuthProfile();
  const handleSignIn = () => navigate('/login');

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div className="about-page">
      <TopBar
        left={
          <Link to={isLoggedIn ? "/home" : "/"} className="topbar-logo">
            <img src="/veri.png" alt="Veri Social" />
          </Link>
        }
        center={<div className="topbar-search-wrap"><SearchBar onSearch={handleSearch} value={searchQ} onChange={setSearchQ} onOptionsClick={() => navigate(`/search?q=${encodeURIComponent(searchQ.trim() || "")}&opts=1`)} /></div>}
        absoluteCenter
        right={<AuthActions />}
      />

      <main className="about-content">
        <h1 className="main-logo">Veri Social</h1>

        <div className="about-section">
          <h2>What Is Veri Social?</h2>
          <p>
            Veri Social is a social network with some similarities to Yelp, Bumble, LinkedIn,
            Substack, and Fiverr. We strive to give our community a platform to facilitate
            interactions based in trust and staked on their own reputations. Veri Social will
            help you to find the people or organizations that you are looking for and build
            your reputation. Our platform features an expressive search which allows you to
            describe exactly what or who you're looking for instead of using only keywords or
            predetermined filters. And we emphasize what others have to say about you
            alongside how you describe yourself. We do not prioritize broadcasting corporate
            messaging to an audience and instead put all our focus into enabling our users
            to find what they are looking for with reliable information.
          </p>
        </div>

        <div className="about-section">
          <h2>What Can Veri Social Do For You?</h2>
          <ul>
            <li>
              <strong>For Everyone</strong> – Find new friends. Find the best nearby pizza, 
              contracting services, custom art, etc.
            </li>
            <li>
              <strong>For Freelancers and Businesses</strong> – Find trustworthy partners and 
              contractors. Insure potential customers find you and know your track record.
            </li>
            <li>
              <strong>For Groups</strong> – Easily find others with your niche shared interests.
            </li>
          </ul>
        </div>

        <div className="about-section">
          <h2>How It Works</h2>
          <ul>
            <li><strong>We</strong> verify every user is <u>who</u> they say they are.</li>
            <li><strong>You</strong> describe exactly what or who you are looking for.</li>
            <li><strong>Our Community</strong> verifies users are <u>what</u> they say they are.</li>
          </ul>
        </div>

        <div className="cta-section">
          {isLoggedIn ? (
            <Link to="/home" className="cta-button">Go to Home</Link>
          ) : (
            <button onClick={handleSignIn} className="cta-button">Get Started</button>
          )}
        </div>
      </main>

      <footer className="about-footer">
        <div className="footer-content">
          <span className="footer-copyright">&copy; 2026 Veri Social</span>
          <div className="footer-links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <a href="mailto:dev@veri.social">Contact Us</a>
          </div>
        </div>
      </footer>

      <style>{`
        .topbar-search-wrap {
          width: 100%;
        }

        .about-page {
          min-height: 100vh;
          background: #f5f5f5;
          display: flex;
          flex-direction: column;
        }

        .about-content {
          max-width: var(--content-max-width);
          margin: 0 auto;
          padding: 40px 24px;
        }

        .main-logo {
          text-align: center;
          font-size: 36px;
          color: #667eea;
          margin: 0 0 40px;
        }

        .about-section {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .about-section h2 {
          margin: 0 0 16px;
          font-size: 22px;
          color: #333;
        }

        .about-section p {
          margin: 0 0 16px;
          line-height: 1.7;
          color: #444;
        }

        .about-section p:last-child {
          margin-bottom: 0;
        }

        .about-section ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .about-section li {
          margin-bottom: 16px;
          line-height: 1.6;
          color: #444;
        }

        .about-section li:last-child {
          margin-bottom: 0;
        }

        .about-section li strong {
          color: #333;
        }

        .about-section strong {
          color: #667eea;
        }

        .cta-section {
          display: flex;
          justify-content: center;
          margin: 8px 0 12px;
        }

        .cta-button {
          display: inline-block;
          padding: 12px 32px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          text-decoration: none;
          cursor: pointer;
        }

        .cta-button:hover {
          background: #5a6fd6;
        }

        .about-footer {
          background: #fff;
          border-top: 1px solid #e0e0e0;
          padding: 16px 24px;
          margin-top: auto;
        }

        .footer-content {
          max-width: var(--content-max-width);
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .footer-copyright {
          color: #666;
          font-size: 14px;
        }

        .footer-links {
          display: flex;
          gap: 16px;
        }

        .footer-links a {
          color: #667eea;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }

        .footer-links a:hover {
          text-decoration: underline;
        }

        @media (max-width: 640px) {
          .about-content {
            padding: 24px 16px;
          }

          .main-logo {
            font-size: 28px;
          }

          .about-section {
            padding: 20px;
          }

          .about-section h2 {
            font-size: 20px;
          }

          .footer-content {
            flex-direction: column;
            text-align: center;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}

export default AboutPage;
