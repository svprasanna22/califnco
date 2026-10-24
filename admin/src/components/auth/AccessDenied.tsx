import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  AlertTriangleIcon,
  LogOutIcon,
  RefreshIcon,
  CopyIcon,
  CheckCircleIcon,
  SpinnerIcon,
} from '../common/Icons';

export function AccessDenied() {
  const { user, logout, recheckAdminStatus, loading } = useAuth();
  const [copied, setCopied] = useState(false);

  const handleCopyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-water-glow" style={{ background: 'radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, rgba(0, 0, 0, 0) 70%)' }} />

      <div className="access-denied-card animate-fade-in">
        <div className="access-denied-icon">
          <AlertTriangleIcon style={{ width: 32, height: 32 }} />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 10 }}>
          Admin Authorization Required
        </h1>

        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
          Signed in as <strong style={{ color: '#fff' }}>{user?.email || 'User'}</strong>.
          <br />
          Your account is valid, but does not have administrator privileges assigned.
        </p>

        <div style={{ textAlign: 'left', marginBottom: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
            USER UID (Provide to System Administrator):
          </span>
          <div className="code-box">
            <span>{user?.uid}</span>
            <button
              onClick={handleCopyUid}
              style={{
                background: 'transparent',
                border: 'none',
                color: copied ? '#34d399' : '#38bdf8',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
              }}
              title="Copy UID"
            >
              {copied ? (
                <>
                  <CheckCircleIcon style={{ width: 14, height: 14 }} />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon style={{ width: 14, height: 14 }} />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="banner-alert banner-info" style={{ textAlign: 'left', marginBottom: 24 }}>
          <div>
            <strong>How to grant access in Firebase:</strong>
            <ul style={{ paddingLeft: 16, marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>
              <li>
                <strong>Option 1:</strong> In Cloud Firestore, create a document at{' '}
                <code>admins/{user?.uid}</code> with fields <code>role: "admin"</code> and <code>active: true</code>.
              </li>
              <li>
                <strong>Option 2:</strong> Set custom claims via Firebase Admin SDK:{' '}
                <code>admin.auth().setCustomUserClaims(uid, &#123; admin: true &#125;)</code>.
              </li>
            </ul>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            className="btn-secondary"
            onClick={recheckAdminStatus}
            disabled={loading}
          >
            {loading ? (
              <SpinnerIcon style={{ width: 16, height: 16 }} />
            ) : (
              <RefreshIcon style={{ width: 16, height: 16 }} />
            )}
            <span>Re-check Access</span>
          </button>

          <button
            className="btn-secondary"
            style={{ borderColor: 'rgba(244, 63, 94, 0.4)', color: '#fda4af' }}
            onClick={logout}
          >
            <LogOutIcon style={{ width: 16, height: 16 }} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
