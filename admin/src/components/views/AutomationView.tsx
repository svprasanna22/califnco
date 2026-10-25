import { useState, useEffect } from 'react';
import {
  subscribeToInstagramPosts,
  subscribeToAutomationState,
  fetchAutomationStatus,
  triggerManualAutomationRun,
  retryPostExecution,
  type InstagramPostRecord,
  type AutomationSystemStatus,
} from '../../services/automationService';
import { fetchProducts, formatINR, type Product } from '../../services/productService';
import {
  SparklesIcon,
  InstagramIcon,
  RefreshIcon,
  SpinnerIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  EyeIcon,
  CopyIcon,
} from '../common/Icons';

export function AutomationView() {
  const [posts, setPosts] = useState<InstagramPostRecord[]>([]);
  const [state, setState] = useState<any>(null);
  const [status, setStatus] = useState<AutomationSystemStatus | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningTest, setRunningTest] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<InstagramPostRecord | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  useEffect(() => {
    let postsLoaded = false;
    let stateLoaded = false;

    // 1. Subscribe to real-time Instagram posts stream
    const unsubPosts = subscribeToInstagramPosts((data) => {
      setPosts(data);
      postsLoaded = true;
      if (postsLoaded && stateLoaded) setLoading(false);
    });

    // 2. Subscribe to real-time automation state
    const unsubState = subscribeToAutomationState((data) => {
      setState(data);
      stateLoaded = true;
      if (postsLoaded && stateLoaded) setLoading(false);
    });

    // 3. Fetch server status & products catalog
    fetchAutomationStatus().then((s) => setStatus(s));
    fetchProducts().then((p) => setProducts(p));

    return () => {
      unsubPosts();
      unsubState();
    };
  }, []);

  const handleRunManualTest = async () => {
    if (runningTest) return;
    setRunningTest(true);
    setNotification(null);

    try {
      const result = await triggerManualAutomationRun();
      if (result.success) {
        showNotification('success', result.message);
        if (result.record) {
          setSelectedPost(result.record);
        }
      } else {
        showNotification('error', result.message);
      }
    } catch (err: unknown) {
      showNotification('error', (err as Error)?.message || 'Failed to trigger automation test.');
    } finally {
      setRunningTest(false);
    }
  };

  const handleRetryPost = async (postId: string) => {
    setRetryingId(postId);
    try {
      const result = await retryPostExecution(postId);
      if (result.success) {
        showNotification('success', result.message);
      } else {
        showNotification('error', result.message);
      }
    } catch (err: unknown) {
      showNotification('error', (err as Error)?.message || 'Failed to retry post.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleCopyCaption = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  // Metrics
  const totalPosts = posts.length;
  const publishedCount = posts.filter((p) => p.status === 'published').length;
  const awaitingCount = posts.filter((p) => p.status === 'awaiting_credentials').length;
  const failedCount = posts.filter((p) => p.status === 'failed').length;
  const latestPost = posts[0] || null;

  if (loading) {
    return (
      <div className="section-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 12 }}>
        <SpinnerIcon className="animate-spin" style={{ width: 22, height: 22, color: 'var(--cyan-primary)' }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Connecting to Cloud Firestore automation stream...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Operations Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
          padding: '18px 24px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
              AI Content Automation — Instagram
            </h1>
            <span className="live-badge" title="Live streaming from Cloud Firestore">
              <span className="live-dot" />
              SCHEDULE ACTIVE
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Autonomous daily product publishing: AI promotional visuals, marketing captions, and Instagram Graph API publication.
            {state?.lastRunDate ? ` Last run: ${state.lastRunDate}.` : ''}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowSetupModal(true)}
            style={{ height: 38, fontSize: 13, gap: 6 }}
          >
            <InstagramIcon style={{ width: 16, height: 16, color: '#e1306c' }} />
            <span>Setup & Credentials</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleRunManualTest}
            disabled={runningTest}
            style={{ height: 38, fontSize: 13, gap: 8, padding: '0 18px', width: 'auto' }}
            title="Generate post and publish immediately"
          >
            {runningTest ? (
              <>
                <SpinnerIcon style={{ width: 15, height: 15 }} className="animate-spin" />
                <span>Generating AI Post...</span>
              </>
            ) : (
              <>
                <SparklesIcon style={{ width: 16, height: 16 }} />
                <span>Run Manual Test Post</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className="animate-fade-in"
          style={{
            background: notification.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
            border: `1px solid ${notification.type === 'success' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'}`,
            color: notification.type === 'success' ? '#34d399' : '#fb7185',
            padding: '14px 20px',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
          }}
        >
          {notification.type === 'success' ? (
            <CheckCircleIcon style={{ width: 18, height: 18, flexShrink: 0 }} />
          ) : (
            <AlertTriangleIcon style={{ width: 18, height: 18, flexShrink: 0 }} />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-card-title">Schedule Cadence</div>
          <div className="stat-card-value" style={{ fontSize: 18, color: 'var(--cyan-primary)' }}>
            Daily at 10:00 AM
          </div>
          <div className="stat-card-subtext">IST (Asia/Kolkata, UTC+05:30)</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-title">Total Automated Posts</div>
          <div className="stat-card-value">{totalPosts.toLocaleString('en-IN')}</div>
          <div className="stat-card-subtext">Recorded in Cloud Firestore</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-title">Published on Instagram</div>
          <div className="stat-card-value" style={{ color: 'var(--emerald-primary)' }}>
            {publishedCount.toLocaleString('en-IN')}
          </div>
          <div className="stat-card-subtext">Via Instagram Graph API v21.0</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-title">Awaiting Live Token</div>
          <div className="stat-card-value" style={{ color: awaitingCount > 0 ? 'var(--amber-primary)' : 'var(--text-muted)' }}>
            {awaitingCount.toLocaleString('en-IN')}
          </div>
          <div className="stat-card-subtext">AI content generated & saved</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-title">Catalog Distribution</div>
          <div className="stat-card-value" style={{ fontSize: 18, color: 'var(--blue-primary)' }}>
            Round-Robin
          </div>
          <div className="stat-card-subtext">{products.length} products • Next index: #{state?.nextProductIndex ?? 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-title">Failed Runs</div>
          <div className="stat-card-value" style={{ color: failedCount > 0 ? 'var(--rose-primary)' : 'var(--text-muted)' }}>
            {failedCount.toLocaleString('en-IN')}
          </div>
          <div className="stat-card-subtext">Safe retry available below</div>
        </div>
      </div>

      {/* Main Two-Column View: Latest Post Preview + Live Feed Table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
        {/* Left Column: Latest Post Showcase */}
        <div className="section-panel" style={{ height: 'fit-content' }}>
          <div className="section-panel-header" style={{ marginBottom: 16 }}>
            <div>
              <h2 className="section-panel-title">Latest Generated Post</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Real-time preview of the current day's AI promotional visual & caption.
              </p>
            </div>
            {latestPost && (
              <span
                className={`status-badge ${
                  latestPost.status === 'published'
                    ? 'status-success'
                    : latestPost.status === 'awaiting_credentials'
                    ? 'status-warning'
                    : 'status-danger'
                }`}
              >
                {latestPost.status === 'published'
                  ? 'Published on Instagram'
                  : latestPost.status === 'awaiting_credentials'
                  ? 'Awaiting Meta Token'
                  : 'Failed'}
              </span>
            )}
          </div>

          {latestPost ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Image Preview with 1:1 Aspect Ratio */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingTop: '100%', // 1:1 Square Instagram aspect ratio
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <img
                  src={latestPost.imageUrl}
                  alt={latestPost.productName}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                  loading="lazy"
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '12px 16px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    {latestPost.productName}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cyan-primary)' }}>
                    {formatINR(latestPost.productPrice)}
                  </span>
                </div>
              </div>

              {/* Caption Box */}
              <div
                style={{
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    AI Marketing Caption & Hashtags
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleCopyCaption(latestPost.fullInstagramText)}
                    style={{ height: 26, fontSize: 11, padding: '0 8px', gap: 4 }}
                  >
                    <CopyIcon style={{ width: 12, height: 12 }} />
                    <span>{copiedCaption ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                    maxHeight: 180,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    paddingRight: 6,
                  }}
                >
                  {latestPost.fullInstagramText}
                </div>
              </div>

              {/* Post Metadata & Permalinks */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Date Key:</span>{' '}
                  <code style={{ color: '#fff' }}>{latestPost.dateKey}</code>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>AI Providers:</span>{' '}
                  <span style={{ color: '#fff' }}>{latestPost.providers?.llm} / {latestPost.providers?.image}</span>
                </div>
                {latestPost.instagramPermalink && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <a
                      href={latestPost.instagramPermalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary"
                      style={{ height: 32, fontSize: 12, width: '100%', gap: 6, justifyContent: 'center' }}
                    >
                      <InstagramIcon style={{ width: 14, height: 14, color: '#e1306c' }} />
                      <span>View Live on Instagram</span>
                      <ExternalLinkIcon style={{ width: 12, height: 12 }} />
                    </a>
                  </div>
                )}
                {latestPost.status === 'awaiting_credentials' && (
                  <div style={{ gridColumn: 'span 2', color: 'var(--amber-primary)', fontSize: 11 }}>
                    ℹ️ Visual and caption generated cleanly. Plug in your Meta Instagram API tokens to enable direct Instagram feed publishing.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 24px',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              <SparklesIcon style={{ width: 36, height: 36, margin: '0 auto 12px auto', opacity: 0.4 }} />
              <div>No automated posts generated yet.</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Click "Run Manual Test Post" above to execute the first run!
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Execution History Log */}
        <div className="section-panel">
          <div className="section-panel-header">
            <div>
              <h2 className="section-panel-title">Execution History Logs</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Persistent record of all automated scheduled and manual runs.
              </p>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {posts.length} Runs Recorded
            </span>
          </div>

          <div className="table-container" style={{ maxHeight: 600, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date & Run ID</th>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Providers</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                      No execution logs found in Firestore.
                    </td>
                  </tr>
                ) : (
                  posts.map((post) => (
                    <tr key={post.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>
                          {post.dateKey}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {new Date(post.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          {post.isManualTrigger && ' • Manual'}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {post.imageUrl && (
                            <img
                              src={post.imageUrl}
                              alt=""
                              style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }}
                            />
                          )}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                              {post.productName}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {formatINR(post.productPrice)}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`status-badge ${
                            post.status === 'published'
                              ? 'status-success'
                              : post.status === 'awaiting_credentials'
                              ? 'status-warning'
                              : 'status-danger'
                          }`}
                        >
                          {post.status === 'published'
                            ? 'Published'
                            : post.status === 'awaiting_credentials'
                            ? 'Awaiting Token'
                            : 'Failed'}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          <div>LLM: {post.providers?.llm || 'gemini'}</div>
                          <div>Image: {post.providers?.image || 'flux'}</div>
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setSelectedPost(post)}
                            style={{ height: 28, fontSize: 11, padding: '0 8px' }}
                            title="Inspect generated visual and caption"
                          >
                            <EyeIcon style={{ width: 12, height: 12 }} />
                            <span>Inspect</span>
                          </button>

                          {(post.status === 'failed' || post.status === 'awaiting_credentials') && (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleRetryPost(post.id)}
                              disabled={retryingId === post.id}
                              style={{ height: 28, fontSize: 11, padding: '0 8px' }}
                              title="Retry Instagram publishing"
                            >
                              {retryingId === post.id ? (
                                <SpinnerIcon style={{ width: 12, height: 12 }} className="animate-spin" />
                              ) : (
                                <RefreshIcon style={{ width: 12, height: 12 }} />
                              )}
                              <span>Retry</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Post Inspection Modal */}
      {selectedPost && (
        <div className="modal-backdrop" onClick={() => setSelectedPost(null)}>
          <div
            className="modal-container animate-fade-in"
            style={{ maxWidth: 640 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Post Inspection — {selectedPost.productName}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Run ID: {selectedPost.runId} • Date: {selectedPost.dateKey}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setSelectedPost(null)}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  width: '100%',
                  maxHeight: 340,
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#000',
                  textAlign: 'center',
                }}
              >
                <img
                  src={selectedPost.imageUrl}
                  alt={selectedPost.productName}
                  style={{ maxHeight: 340, maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: 14,
                  borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 180,
                  overflowY: 'auto',
                }}
              >
                {selectedPost.fullInstagramText}
              </div>

              {selectedPost.errorDetails && (
                <div
                  style={{
                    background: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#fb7185',
                  }}
                >
                  <strong>Diagnostics:</strong> {selectedPost.errorDetails}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ marginTop: 20 }}>
              {selectedPost.instagramPermalink && (
                <a
                  href={selectedPost.instagramPermalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ width: 'auto', height: 36, fontSize: 13, gap: 6 }}
                >
                  <InstagramIcon style={{ width: 14, height: 14 }} />
                  <span>Open Instagram Link</span>
                </a>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedPost(null)}
                style={{ height: 36, fontSize: 13 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup & Credentials Guide Modal */}
      {showSetupModal && (
        <div className="modal-backdrop" onClick={() => setShowSetupModal(false)}>
          <div
            className="modal-container animate-fade-in"
            style={{ maxWidth: 700 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Instagram & AI Provider Setup Guide</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Configure your zero-cost API credentials securely on your Render backend or GitHub repository.
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setShowSetupModal(false)}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, lineHeight: 1.6 }}>
              {status?.credentialsHealth && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Instagram API</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: status.credentialsHealth.instagramConfigured ? '#34d399' : '#fbbf24' }}>
                      {status.credentialsHealth.instagramConfigured ? '● Connected' : '○ Standby'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Gemini AI</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: status.credentialsHealth.geminiConfigured ? '#34d399' : '#94a3b8' }}>
                      {status.credentialsHealth.geminiConfigured ? '● Configured' : '○ Smart Fallback'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>FLUX AI Visuals</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#34d399' }}>
                      ● Online (Zero-Cost)
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Image CDN</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: status.credentialsHealth.cloudinaryConfigured ? '#34d399' : '#38bdf8' }}>
                      {status.credentialsHealth.cloudinaryConfigured ? '● Cloudinary CDN' : '● Direct CDN'}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', padding: 14, borderRadius: 10 }}>
                <strong style={{ color: 'var(--cyan-primary)' }}>Official Meta Instagram Graph API Requirements:</strong>
                <ol style={{ marginTop: 6, paddingLeft: 20, color: 'var(--text-primary)' }}>
                  <li>Convert your Instagram account to a <strong>Professional Account</strong> (Business or Creator).</li>
                  <li>Link your Instagram Professional Account to a Facebook Page.</li>
                  <li>Create an App in the <a href="https://developers.facebook.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--cyan-primary)' }}>Meta for Developers</a> console.</li>
                  <li>Add permissions: <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>pages_show_list</code>.</li>
                  <li>Generate a Long-Lived Access Token and obtain your Instagram Business Account ID.</li>
                </ol>
              </div>

              <div>
                <strong style={{ color: '#fff' }}>Environment Variables to configure on Render:</strong>
                <pre
                  style={{
                    background: '#090d16',
                    border: '1px solid var(--border-subtle)',
                    padding: 12,
                    borderRadius: 8,
                    marginTop: 8,
                    color: '#34d399',
                    fontSize: 12,
                    overflowX: 'auto',
                  }}
                >
{`# 1. Official Instagram Graph API Credentials
INSTAGRAM_ACCOUNT_ID=17841400000000000
INSTAGRAM_ACCESS_TOKEN=EAAG...YourLongLivedMetaToken...

# 2. AI Caption Provider (Free Tier)
GEMINI_API_KEY=AIzaSy...YourGeminiApiKey...
# Optional Groq fallback:
GROQ_API_KEY=gsk_...

# 3. AI Image Generation (Optional token for HuggingFace; Pollinations works with zero token!)
HF_TOKEN=hf_...

# 4. Image Hosting (Optional Cloudinary/ImgBB for custom CDN)
CLOUDINARY_CLOUD_NAME=califnco
CLOUDINARY_API_KEY=123456789
CLOUDINARY_API_SECRET=abc...`}
                </pre>
              </div>

              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                🔒 <strong>Security Policy:</strong> API tokens are stored strictly server-side on Render and never bundled into frontend assets or client web browsers.
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowSetupModal(false)}
                style={{ width: 'auto', height: 36, fontSize: 13 }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
