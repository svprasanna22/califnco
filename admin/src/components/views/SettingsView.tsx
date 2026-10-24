import { useAuth } from '../../context/AuthContext';
import { ShieldCheckIcon, CopyIcon, CheckCircleIcon } from '../common/Icons';
import { useState } from 'react';

export function SettingsView() {
  const { user, adminStatus } = useAuth();
  const [copied, setCopied] = useState(false);

  const webhookUrl = 'https://automation.califnco.internal/webhook/instagram-lead';

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="section-panel">
        <div className="section-panel-header">
          <h2 className="section-panel-title">Administrator Security & Authorization</h2>
          <span className="status-badge status-success">
            <ShieldCheckIcon style={{ width: 14, height: 14 }} />
            Active Session
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Signed In Administrator</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 4 }}>{user?.email}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>UID: {user?.uid}</div>
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Authorization Method</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cyan-primary)', marginTop: 4 }}>
              {adminStatus?.source === 'custom_claim'
                ? 'Firebase Auth Custom Claim (admin: true)'
                : 'Cloud Firestore admins/{uid} record'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              Protected against client self-escalation
            </div>
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Firebase Project</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 4 }}>
              {import.meta.env.VITE_FIREBASE_PROJECT_ID || 'califnco-app-f2b7c'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--teal-primary)', marginTop: 4 }}>
              Web App: califnco-admin
            </div>
          </div>
        </div>
      </div>

      <div className="section-panel">
        <div className="section-panel-header">
          <h2 className="section-panel-title">n8n Instagram Lead Automation Integration</h2>
          <span className="status-badge status-info">Scaffold Ready</span>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
          The Califnco Instagram DM & Lead automation workflow receives inquiries from Instagram Graph API,
          creates qualified leads, and alerts regional distributors.
        </p>

        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
            Configured n8n Inbound Webhook:
          </span>
          <div className="code-box">
            <span>{webhookUrl}</span>
            <button
              onClick={handleCopyWebhook}
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

        <div className="banner-alert banner-info">
          Documentation and sample workflow payloads are organized inside <code>automation/workflows</code> and <code>automation/docs</code>.
        </div>
      </div>
    </div>
  );
}
