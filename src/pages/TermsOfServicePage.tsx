import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import SearchBar from '../components/SearchBar';
import AuthActions from '../components/AuthActions';

function TermsOfServicePage() {
  const navigate = useNavigate();
  const [searchQ, setSearchQ] = useState('');

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="terms-of-service-page">
      <TopBar
        left={<Link to="/" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        center={<div className="topbar-search-wrap"><SearchBar onSearch={handleSearch} value={searchQ} onChange={setSearchQ} onOptionsClick={() => navigate(`/search?q=${encodeURIComponent(searchQ.trim() || "")}&opts=1`)} /></div>}
        absoluteCenter
        right={<AuthActions />}
      />

      <main className="terms-content">
        <h1 className="terms-main-title">Terms of Service</h1>
        <p className="effective-date">
          <strong>Effective Date:</strong> April 27, 2026 &nbsp;|&nbsp; <strong>Last Updated:</strong> April 27, 2026
        </p>

        <section>
          <p>
            Welcome to Veri Social (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). These Terms of Service (&quot;Terms&quot;)
            govern your access to and use of the Veri Social website at{' '}
            <a href="https://veri.social">https://veri.social</a>, our mobile applications, and all associated services
            (collectively, the &quot;Service&quot;).
          </p>
          <p>
            By registering for, accessing, or using the Service, you agree to be bound by
            these Terms and our Privacy Policy. If you do not agree to these Terms, you may
            not use the Service.
          </p>
        </section>

        <section>
          <h2>1. Description of the Service</h2>
          <p>
            Veri Social is a social reputation network designed to help users build and
            share authentic social profiles based on peer reviews, ratings, and
            endorsements. We provide the infrastructure for users to interact, leave
            feedback, and view the public reputation of other individuals on the platform.
          </p>
        </section>

        <section>
          <h2>2. Eligibility and Identity Verification</h2>
          <p>
            You must be at least 13 years old to use the Service. By using the
            Service, you represent and warrant that you have the legal capacity to form a
            binding contract.
          </p>
          <p>
            <strong>Authenticity and Live Selfie Verification:</strong> Veri Social is built on trust and
            authenticity. To prevent bots, fake accounts, and impersonation, we require
            users to verify their identity upon registration.
          </p>
          <ul>
            <li><strong>Verification Process:</strong> You must complete a live selfie verification process.</li>
            <li><strong>Third-Party Processing:</strong> This process is securely handled by our trusted third-party verification partner. We strictly limit the information shared with this partner to your live selfie and name solely for the purpose of verifying your identity.</li>
            <li><strong>No Sale of Likeness:</strong> As detailed in our Privacy Policy, your likeness, biometric data, and contact information will never be sold by us or our verification partners.</li>
            <li><strong>One Account per Person:</strong> You may only create and maintain one active Veri Social account.</li>
          </ul>
        </section>

        <section>
          <h2>3. Account Security</h2>
          <p>
            You are responsible for safeguarding your account login credentials. You agree
            not to disclose your password to any third party and to notify us immediately of
            any unauthorized use of your account. You are responsible for all activities
            that occur under your account.
          </p>
        </section>

        <section>
          <h2>4. User Conduct and Content Guidelines</h2>
          <p>
            &quot;Content&quot; refers to any text, images, ratings, reviews, comments, or other
            materials you post on the Service. You retain ownership of your Content, but you
            are solely responsible for it.
          </p>
          <p>
            Because Veri Social relies on authentic peer feedback, you agree NOT to:
          </p>
          <ul>
            <li><strong>Post Defamatory or False Content:</strong> Post reviews, ratings, or comments about another user that you know to be false, misleading, or defamatory.</li>
            <li><strong>Harass or Bully:</strong> Engage in targeted harassment, bullying, doxing (publishing private contact information), or intimidation of other users.</li>
            <li><strong>Post Offensive Material:</strong> Upload content that promotes violence, hate speech, illegal acts, or contains sexually explicit material.</li>
            <li><strong>Manipulate the System:</strong> Buy, sell, or trade reviews/ratings; use automated scripts to inflate or deflate reputation scores; or retaliate against users for leaving honest reviews.</li>
            <li><strong>Impersonate Others:</strong> Create accounts in the name of another person, use a fake identity, or misrepresent your affiliation with any person or entity.</li>
          </ul>
          <p>
            We reserve the right (but have no obligation) to review, flag, modify, or remove
            any Content that violates these Terms or that we determine, in our sole
            discretion, is harmful to the platform.
          </p>
        </section>

        <section>
          <h2>5. Disputing Content and Platform Immunity</h2>
          <p>
            Veri Social provides a platform for users to share their opinions. We do not
            independently verify the accuracy of user-generated reviews or ratings.
          </p>
          <ul>
            <li><strong>Platform Protection (Section 230):</strong> If you are based in the United States, Veri Social acts as an &quot;interactive computer service&quot; under Section 230 of the Communications Decency Act. We are not the publisher or speaker of any information provided by another user, and we are not legally liable for defamatory or otherwise actionable Content posted by users.</li>
            <li><strong>Flagging Content:</strong> If you believe a review violates our User Conduct Guidelines (e.g., it contains hate speech, doxing, or objectively false claims), you may use the in-app &quot;Flag&quot; feature. Veri Social will review flagged Content but makes no guarantee that Content will be removed unless it explicitly violates these Terms or applicable law.</li>
          </ul>
        </section>

        <section>
          <h2>6. Intellectual Property Rights</h2>
          <ul>
            <li><strong>Your Content License:</strong> By posting Content on Veri Social, you grant us a worldwide, non-exclusive, royalty-free, transferable, and sub-licensable license to use, reproduce, distribute, prepare derivative works of, display, and perform your Content in connection with operating, promoting, and improving the Service.</li>
            <li><strong>Veri Social&apos;s Property:</strong> The Service, including its code, design, algorithms, reputation-scoring systems, and trademarks, are the exclusive property of Veri Social and its licensors. You may not copy, modify, or distribute our intellectual property without prior written consent.</li>
          </ul>
        </section>

        <section>
          <h2>7. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your account and access to the
            Service at our sole discretion, without notice or liability, for any reason,
            including but not limited to a violation of these Terms. Upon termination, your
            right to use the Service will immediately cease, and we may delete or anonymize
            your profile and Content.
          </p>
        </section>

        <section>
          <h2>8. Disclaimers of Warranty</h2>
          <p>
            THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS. TO THE MAXIMUM
            EXTENT PERMITTED BY LAW, VERI SOCIAL DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS
            OR IMPLIED, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE
            WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, OR THAT REPUTATION SCORES OR
            REVIEWS WILL BE ACCURATE OR RELIABLE.
          </p>
        </section>

        <section>
          <h2>9. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, VERI SOCIAL AND ITS DIRECTORS,
            EMPLOYEES, AND PARTNERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES,
            WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR
            OTHER INTANGIBLE LOSSES, RESULTING FROM (A) YOUR ACCESS TO OR USE OF OR
            INABILITY TO ACCESS OR USE THE SERVICE; (B) ANY CONDUCT OR CONTENT OF ANY THIRD
            PARTY ON THE SERVICE, INCLUDING DEFAMATORY, OFFENSIVE, OR ILLEGAL CONDUCT; OR
            (C) UNAUTHORIZED ACCESS, USE, OR ALTERATION OF YOUR CONTENT.
          </p>
        </section>

        <section>
          <h2>10. Dispute Resolution and Arbitration</h2>
          <p>
            Please read this section carefully. It affects your legal rights.
          </p>
          <ul>
            <li><strong>Binding Arbitration:</strong> Any dispute, claim, or controversy arising out of or relating to these Terms or the breach, termination, enforcement, interpretation, or validity thereof, shall be settled by binding arbitration administered by the American Arbitration Association (AAA) under its Commercial Arbitration Rules, rather than in court.</li>
            <li><strong>Class Action Waiver:</strong> You and Veri Social agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action.</li>
          </ul>
        </section>

        <section>
          <h2>11. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of
            the State of New York, without regard to its conflict of law
            provisions. Any legal action or proceeding not subject to arbitration shall be
            brought exclusively in the state or federal courts located in New York of the
            United States of America.
          </p>
        </section>

        <section>
          <h2>12. Changes to these Terms</h2>
          <p>
            We may modify these Terms at any time. If we make material changes, we will
            provide notice through the Service or by email. Your continued use of the
            Service after the effective date of the updated Terms constitutes your
            acceptance of the changes.
          </p>
        </section>

        <section>
          <h2>13. Contact Information</h2>
          <p>
            If you have any questions about these Terms, please contact us at:
          </p>
          <p>
            <strong>Veri Social</strong><br />
            Email: <a href="mailto:dev@veri.social">dev@veri.social</a>
          </p>
        </section>
      </main>

      <style>{`
        .terms-of-service-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #f8f9fa;
          color: #333;
          line-height: 1.7;
        }
        .page-title {
          margin: 0;
          font-size: 20px;
          color: #667eea;
        }
        .terms-content {
          flex: 1;
          max-width: var(--content-max-width);
          margin: 0 auto;
          padding: 40px 24px;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          margin-top: 24px;
          margin-bottom: 24px;
        }
        .terms-content h2 {
          color: #444;
          margin-top: 32px;
          margin-bottom: 12px;
          font-size: 20px;
          border-bottom: 2px solid #e0e0e0;
          padding-bottom: 8px;
        }
        .terms-content h3 {
          color: #555;
          margin-top: 20px;
          margin-bottom: 8px;
          font-size: 16px;
          font-weight: 600;
        }
        .terms-content p {
          margin-bottom: 12px;
        }
        .terms-content ul {
          margin-bottom: 16px;
          padding-left: 24px;
        }
        .terms-content li {
          margin-bottom: 8px;
        }
        .terms-content a {
          color: #667eea;
          text-decoration: none;
        }
        .terms-content a:hover {
          text-decoration: underline;
        }
        .terms-main-title {
          text-align: center;
          font-size: 32px;
          color: #667eea;
          margin: 0 0 8px;
        }
        .effective-date {
          color: #666;
          font-size: 14px;
          margin-bottom: 32px;
        }
        .topbar-search-wrap {
          width: 100%;
        }
        @media (max-width: 600px) {
          .terms-content {
            padding: 24px 16px;
            margin: 16px;
          }
          .terms-content h2 {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
}

export default TermsOfServicePage;
