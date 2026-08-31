import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import SearchBar from '../components/SearchBar';
import AuthActions from '../components/AuthActions';

function PrivacyPolicyPage() {
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
    <div className="privacy-policy-page">
      <TopBar
        left={<Link to="/" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        center={<div className="topbar-search-wrap"><SearchBar onSearch={handleSearch} value={searchQ} onChange={setSearchQ} onOptionsClick={() => navigate(`/search?q=${encodeURIComponent(searchQ.trim() || "")}&opts=1`)} /></div>}
        absoluteCenter
        right={<AuthActions />}
      />

      <main className="privacy-content">
        <h1 className="privacy-main-title">Privacy Policy</h1>
        <p className="effective-date">
          <strong>Effective Date:</strong> April 26, 2026 &nbsp;|&nbsp; <strong>Last Updated:</strong> April 26, 2026
        </p>

        <section>
          <p>
            Welcome to Veri Social (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to protecting
            your privacy and ensuring you understand how your information is used on our
            platform. This Privacy Policy explains how we collect, use, disclose, and
            safeguard your personal information when you visit our website at{' '}
            <a href="https://veri.social">https://veri.social</a>, use our mobile applications, or interact with our services
            (collectively, the &quot;Service&quot;).
          </p>
          <p>
            By accessing or using the Service, you signify that you have read, understood,
            and agree to our collection, storage, use, and disclosure of your personal
            information as described in this Privacy Policy.
          </p>
        </section>

        <section>
          <h2>1. Information We Collect</h2>
          <p>
            To provide our reputation-based social network and ensure the authenticity of
            our users, we collect information you provide directly to us, information
            collected automatically, and information from third parties.
          </p>

          <h3>A. Information You Provide to Us</h3>
          <ul>
            <li><strong>Account Information:</strong> When you register, we collect your name, email address, phone number, username, password, and date of birth.</li>
            <li><strong>Identity Verification Data (Live Selfie):</strong> To maintain the integrity of our platform and ensure users are real people, we require a live selfie verification during registration. We collect this facial image/scan solely for identity verification purposes.</li>
            <li><strong>Profile Information:</strong> You may provide a profile picture, bio, links to other social media accounts, professional history, and other details to build your reputation profile.</li>
            <li><strong>User-Generated Content:</strong> As a platform built on social reputation (&quot;What others say about you matters&quot;), we collect the reviews, ratings, endorsements, comments, and messages you post about others, as well as those posted about you.</li>
            <li><strong>Communications:</strong> Information you provide when you contact customer support or communicate with us.</li>
          </ul>

          <h3>B. Information We Collect Automatically</h3>
          <ul>
            <li><strong>Device and Usage Data:</strong> We collect your IP address, browser type, operating system, device identifiers, referring URLs, and information about your interactions with the Service.</li>
            <li><strong>Cookies and Tracking Technologies:</strong> We use cookies, web beacons, and similar technologies to track activity on our Service, remember your preferences, and analyze user trends.</li>
          </ul>

          <h3>C. Information from Third Parties</h3>
          <ul>
            <li><strong>Social Media Integrations:</strong> If you choose to link your Veri Social account to third-party networks, we may receive information from those platforms according to their authorization procedures.</li>
          </ul>
        </section>

        <section>
          <h2>2. Our Strict &quot;No Sale&quot; Policy</h2>
          <p>
            We believe your personal data belongs to you. We do not sell your contact
            information (such as your email address, phone number, or physical address) to
            any third parties for marketing or any other purposes.
          </p>
          <p>
            Furthermore, we will never sell your live selfie, biometric data, or likeness at
            any point. Your verification data is strictly used for platform security.
          </p>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We use the collected information for the following purposes:</p>
          <ul>
            <li><strong>To Verify Your Identity:</strong> To process your live selfie during registration and prevent bots, impersonation, or duplicate accounts.</li>
            <li><strong>To Provide and Maintain the Service:</strong> To create and manage your account, facilitate the posting of reviews/ratings, and calculate reputation scores.</li>
            <li><strong>To Personalize Your Experience:</strong> To tailor content, suggestions, and connections based on your network and interactions.</li>
            <li><strong>To Ensure Safety and Security:</strong> To detect, prevent, and address fraud, harassment, fake accounts, and potential breaches of our Terms of Service.</li>
            <li><strong>To Communicate with You:</strong> To send administrative notices, security alerts, and updates.</li>
          </ul>
        </section>

        <section>
          <h2>4. How We Share Your Information</h2>
          <p>We only share your information in the following specific situations:</p>
          <ul>
            <li><strong>Publicly on the Platform:</strong> By design, your profile information, public reputation score, and the public reviews/endorsements you write or receive will be visible to other users of Veri Social.</li>
            <li><strong>With Identity Verification Partners:</strong> We use a secure, trusted third-party service to process your live selfie registration. This third party is strictly limited in what they can access. They are only provided with your live selfie and your name to complete the verification. They are explicitly prohibited from accessing your contact information, profile data, platform activity, or any other personal information, and they are prohibited from using your selfie for any purpose other than verifying your identity for Veri Social.</li>
            <li><strong>With Other Service Providers:</strong> We share data with trusted third-party vendors who assist us in operating our Service (e.g., cloud hosting, email delivery). These providers are bound by strict data processing agreements.</li>
            <li><strong>For Business Transfers:</strong> If we are involved in a merger, acquisition, bankruptcy, or sale of assets, your information may be transferred as a business asset (excluding the sale of your contact info or likeness as a standalone asset).</li>
            <li><strong>For Legal and Safety Reasons:</strong> We may disclose your information if required to do so by law (e.g., a subpoena) or if we believe it is necessary to protect the rights, property, or safety of Veri Social, our users, or the public.</li>
          </ul>
        </section>

        <section>
          <h2>5. Your Privacy Rights and Choices</h2>
          <p>Depending on your location, you may have the following rights regarding your personal data:</p>
          <ul>
            <li><strong>Access and Portability:</strong> You can request a copy of the personal data we hold about you.</li>
            <li><strong>Correction:</strong> You can edit or update your profile information at any time through your account settings.</li>
            <li><strong>Deletion (&quot;Right to be Forgotten&quot;):</strong> You can request the deletion of your account and personal data. Note: Because our platform relies on authentic reputation data, if you request deletion, reviews you have written about others may be anonymized rather than deleted, subject to applicable law.</li>
            <li><strong>Withdraw Consent:</strong> Where we rely on your consent to process data (such as for your live selfie verification), you have the right to withdraw it by deleting your account.</li>
          </ul>
          <p>To exercise these rights, please contact us at <a href="mailto:dev@veri.social">dev@veri.social</a>.</p>
        </section>

        <section>
          <h2>6. Data Retention</h2>
          <p>
            We retain your personal information for as long as your account is active or as
            needed to provide you the Service.
          </p>
          <p>
            <strong>Special Note on Biometric/Verification Data:</strong> Your live selfie and any associated
            biometric data are retained only for as long as is necessary to complete the
            initial identity verification process and maintain the ongoing security of your
            account, or as required by applicable law. It is securely destroyed once no
            longer needed for these specific purposes.
          </p>
        </section>

        <section>
          <h2>7. Data Security</h2>
          <p>
            We implement commercially reasonable technical, administrative, and physical
            security measures to protect your information from unauthorized access,
            destruction, or alteration. However, no method of transmission over the Internet
            or electronic storage is 100% secure. Therefore, we cannot guarantee absolute
            security.
          </p>
        </section>

        <section>
          <h2>8. Children&apos;s Privacy</h2>
          <p>
            Veri Social is not intended for individuals under the age of 13. We
            do not knowingly collect personal information from children. If we become aware
            that we have collected personal data from a child without parental consent, we
            will take steps to delete that information promptly.
          </p>
        </section>

        <section>
          <h2>9. International Data Transfers</h2>
          <p>
            Veri Social is headquartered in the United States. Your
            information may be transferred to, stored, and processed in countries other than
            your own. By using our Service, you consent to the transfer of your information
            to facilities located in the United States and to our third-party processors.
          </p>
        </section>

        <section>
          <h2>10. Changes to this Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our
            practices or legal requirements. If we make material changes, we will notify you
            by email or by posting a prominent notice on our platform prior to the change
            becoming effective. Your continued use of the Service after the effective date
            constitutes your acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2>11. Contact Us</h2>
          <p>
            If you have any questions, concerns, or requests regarding this Privacy Policy
            or our data practices, please contact us at:
          </p>
          <p>
            <strong>Veri Social</strong><br />
            Email: <a href="mailto:dev@veri.social">dev@veri.social</a>
          </p>
        </section>
      </main>

      <style>{`
        .privacy-policy-page {
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
        .privacy-content {
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
        .privacy-content h2 {
          color: #444;
          margin-top: 32px;
          margin-bottom: 12px;
          font-size: 20px;
          border-bottom: 2px solid #e0e0e0;
          padding-bottom: 8px;
        }
        .privacy-content h3 {
          color: #555;
          margin-top: 20px;
          margin-bottom: 8px;
          font-size: 16px;
          font-weight: 600;
        }
        .privacy-content p {
          margin-bottom: 12px;
        }
        .privacy-content ul {
          margin-bottom: 16px;
          padding-left: 24px;
        }
        .privacy-content li {
          margin-bottom: 8px;
        }
        .privacy-content a {
          color: #667eea;
          text-decoration: none;
        }
        .privacy-content a:hover {
          text-decoration: underline;
        }
        .privacy-main-title {
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
          .privacy-content {
            padding: 24px 16px;
            margin: 16px;
          }
          .privacy-content h2 {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
}

export default PrivacyPolicyPage;
