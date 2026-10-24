import { useState, useEffect, useCallback } from 'react';
import {
  fetchDealers,
  createDealer,
  updateDealer,
  updateDealerStatus,
  removeDealer,
  type Dealer,
  type DealerInput,
  type DealerStatus,
  type DealerTier,
  DEALER_TIER_CONFIG,
} from '../../services/dealerService';
import { useAuth } from '../../context/AuthContext';
import { DealerModal } from './DealerModal';
import {
  DealersIcon,
  SearchIcon,
  RefreshIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
} from '../common/Icons';

export function DealersView() {
  const { user } = useAuth();
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<DealerStatus | 'all'>('all');
  const [tierFilter, setTierFilter] = useState<DealerTier | 'all'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDealer, setEditingDealer] = useState<Dealer | null>(null);

  // Confirmation Modals State
  const [suspendingDealer, setSuspendingDealer] = useState<Dealer | null>(null);
  const [deletingDealer, setDeletingDealer] = useState<Dealer | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  const loadDealers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDealers();
      setDealers(data);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to load dealers from Cloud Firestore.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDealers();
  }, [loadDealers]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleOpenAdd = () => {
    setEditingDealer(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dealer: Dealer) => {
    setEditingDealer(dealer);
    setIsModalOpen(true);
  };

  const handleSaveDealer = async (data: DealerInput) => {
    if (!user?.uid) {
      throw new Error('Administrator session not found. Please re-authenticate.');
    }

    if (editingDealer) {
      await updateDealer(editingDealer.id, data, user.uid);
      showSuccess(`Dealer "${data.businessName}" updated successfully.`);
    } else {
      await createDealer(data, user.uid);
      showSuccess(`Dealer "${data.businessName}" registered successfully.`);
    }
    await loadDealers();
  };

  const handleConfirmSuspend = async () => {
    if (!suspendingDealer || !user?.uid) return;
    setActionInProgress(true);
    try {
      await updateDealerStatus(suspendingDealer.id, 'suspended', user.uid);
      showSuccess(`Dealer "${suspendingDealer.businessName}" status set to Suspended.`);
      setSuspendingDealer(null);
      await loadDealers();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to suspend dealer.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleQuickActivate = async (dealer: Dealer) => {
    if (!user?.uid) return;
    try {
      await updateDealerStatus(dealer.id, 'active', user.uid);
      showSuccess(`Dealer "${dealer.businessName}" activated.`);
      await loadDealers();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to activate dealer.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingDealer) return;
    setActionInProgress(true);
    try {
      await removeDealer(deletingDealer.id);
      showSuccess(`Dealer "${deletingDealer.businessName}" permanently deleted from Firestore.`);
      setDeletingDealer(null);
      await loadDealers();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to delete dealer document.');
    } finally {
      setActionInProgress(false);
    }
  };

  // Filter and search computation
  const filteredDealers = dealers.filter((dealer) => {
    const matchesStatus = statusFilter === 'all' || dealer.status === statusFilter;
    const matchesTier = tierFilter === 'all' || dealer.tier === tierFilter;

    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (dealer.dealerCode || '').toLowerCase().includes(term) ||
      (dealer.businessName || '').toLowerCase().includes(term) ||
      (dealer.contactPerson || '').toLowerCase().includes(term) ||
      (dealer.email || '').toLowerCase().includes(term) ||
      (dealer.phone || '').toLowerCase().includes(term) ||
      (dealer.address.city || '').toLowerCase().includes(term) ||
      (dealer.address.state || '').toLowerCase().includes(term);

    return matchesStatus && matchesTier && matchesSearch;
  });

  const getStatusBadge = (status: DealerStatus) => {
    switch (status) {
      case 'active':
        return <span className="status-badge status-success">Active</span>;
      case 'pending':
        return <span className="status-badge status-warning">Pending</span>;
      case 'suspended':
        return <span className="status-badge status-danger">Suspended</span>;
      default:
        return <span className="status-badge status-info">{status}</span>;
    }
  };

  const formatDate = (dateVal: any) => {
    if (!dateVal) return 'N/A';
    try {
      if (dateVal.toDate) return dateVal.toDate().toLocaleDateString('en-IN');
      return new Date(dateVal).toLocaleDateString('en-IN');
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Success Notification Banner */}
      {successMessage && (
        <div className="banner-alert banner-info" role="status" style={{ marginBottom: 16 }}>
          <CheckCircleIcon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2, color: '#34d399' }} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Notification Banner */}
      {error && (
        <div className="banner-alert banner-error" role="alert" style={{ marginBottom: 16 }}>
          <AlertTriangleIcon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div>{error}</div>
            <button
              onClick={loadDealers}
              className="btn-secondary"
              style={{ marginTop: 8, height: 28, padding: '0 10px', fontSize: 11 }}
            >
              <RefreshIcon style={{ width: 12, height: 12 }} />
              <span>Retry Firestore Query</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Panel */}
      <div className="section-panel">
        <div
          className="section-panel-header"
          style={{ flexWrap: 'wrap', gap: 16, alignItems: 'center' }}
        >
          <div>
            <h2 className="section-panel-title">Authorized Dealer & Service Center Network</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Certified regional distributors, stockists, and local purifier installation partners.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={handleOpenAdd}
              className="btn-primary"
              style={{ height: 36, padding: '0 16px', fontSize: 13, gap: 6 }}
            >
              <PlusIcon style={{ width: 15, height: 15 }} />
              <span>Register Dealer</span>
            </button>

            <button
              onClick={loadDealers}
              className="btn-secondary"
              disabled={loading}
              title="Refresh dealers from Firestore"
              aria-label="Refresh dealers"
            >
              <RefreshIcon style={{ width: 14, height: 14 }} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}
        >
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              padding: '8px 14px',
              minWidth: 260,
              flex: '1 1 260px',
              maxWidth: 360,
            }}
          >
            <SearchIcon style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by name, contact, phone, city, code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                outline: 'none',
                width: '100%',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Status Filter Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as DealerStatus | 'all')}
                className="form-input"
                style={{ height: 36, padding: '0 10px', fontSize: 12, width: 130, cursor: 'pointer' }}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            {/* Tier Filter Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tier:</span>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as DealerTier | 'all')}
                className="form-input"
                style={{ height: 36, padding: '0 10px', fontSize: 12, width: 150, cursor: 'pointer' }}
              >
                <option value="all">All Tiers</option>
                {(Object.keys(DEALER_TIER_CONFIG) as DealerTier[]).map((tKey) => (
                  <option key={tKey} value={tKey}>
                    {DEALER_TIER_CONFIG[tKey].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Dealers Table & Dynamic States */}
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <SpinnerIcon style={{ width: 28, height: 28, color: 'var(--cyan-primary)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 500 }}>Loading dealers from Cloud Firestore...</div>
          </div>
        ) : filteredDealers.length === 0 ? (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: 12,
              border: '1px dashed var(--border-subtle)',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'var(--cyan-glow)',
                color: 'var(--cyan-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <DealersIcon style={{ width: 24, height: 24 }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 6 }}>
              {dealers.length === 0 ? 'No Dealers Registered in Firestore' : 'No Matching Dealers Found'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto' }}>
              {dealers.length === 0
                ? 'Your Cloud Firestore dealers directory is currently empty. Add authorized water purifier distributors, regional stockists, and installation partners.'
                : 'Try adjusting your search query, or clear status and tier filters.'}
            </p>
            {dealers.length === 0 && (
              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleOpenAdd}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 auto' }}
                >
                  <PlusIcon style={{ width: 14, height: 14 }} />
                  <span>Register First Dealer</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dealer Code</th>
                  <th>Business / Franchise</th>
                  <th>Service Territory</th>
                  <th>Partner Tier</th>
                  <th>Installed Base</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDealers.map((dealer) => {
                  const tierConfig = DEALER_TIER_CONFIG[dealer.tier] || {
                    label: dealer.tier,
                    badgeColor: 'var(--cyan-primary)',
                  };

                  return (
                    <tr key={dealer.id}>
                      <td>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fff' }}>
                          {dealer.dealerCode}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {formatDate(dealer.createdAt)}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{dealer.businessName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Rep: {dealer.contactPerson} • {dealer.phone}
                        </div>
                        {dealer.gstin && (
                          <div style={{ fontSize: 10, color: 'var(--cyan-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                            GSTIN: {dealer.gstin}
                          </div>
                        )}
                      </td>

                      <td>
                        <div style={{ fontWeight: 500, color: '#fff' }}>{dealer.address.city}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {dealer.address.state} ({dealer.address.postalCode})
                        </div>
                      </td>

                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: tierConfig.badgeColor,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <ShieldCheckIcon style={{ width: 14, height: 14 }} />
                          {tierConfig.label}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontWeight: 700, color: '#fff' }}>
                          {dealer.installedBaseCount ?? 0}{' '}
                          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>units</span>
                        </div>
                      </td>

                      <td>{getStatusBadge(dealer.status)}</td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          {/* Edit Action */}
                          <button
                            onClick={() => handleOpenEdit(dealer)}
                            className="btn-secondary"
                            style={{ padding: '6px 10px', height: 32, fontSize: 12, gap: 4 }}
                            title="Edit dealer profile"
                          >
                            <EditIcon style={{ width: 13, height: 13 }} />
                            <span>Edit</span>
                          </button>

                          {/* Suspend / Activate Toggle */}
                          {dealer.status === 'suspended' ? (
                            <button
                              onClick={() => handleQuickActivate(dealer)}
                              className="btn-secondary"
                              style={{
                                padding: '6px 10px',
                                height: 32,
                                fontSize: 11,
                                borderColor: 'rgba(52, 211, 153, 0.4)',
                                color: '#34d399',
                              }}
                              title="Activate dealer"
                            >
                              Activate
                            </button>
                          ) : (
                            <button
                              onClick={() => setSuspendingDealer(dealer)}
                              className="btn-secondary"
                              style={{
                                padding: '6px 10px',
                                height: 32,
                                fontSize: 11,
                                borderColor: 'rgba(239, 68, 68, 0.4)',
                                color: '#f87171',
                              }}
                              title="Suspend dealer"
                            >
                              Suspend
                            </button>
                          )}

                          {/* Delete Action */}
                          <button
                            onClick={() => setDeletingDealer(dealer)}
                            className="btn-secondary"
                            style={{
                              padding: '6px 8px',
                              height: 32,
                              fontSize: 12,
                              borderColor: 'rgba(239, 68, 68, 0.3)',
                              color: '#f87171',
                            }}
                            title="Delete dealer from Firestore"
                          >
                            <TrashIcon style={{ width: 13, height: 13 }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Dealer Modal */}
      <DealerModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDealer(null);
        }}
        onSubmit={handleSaveDealer}
        initialDealer={editingDealer}
      />

      {/* Explicit Suspension Confirmation Modal */}
      {suspendingDealer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(6px)',
            zIndex: 110,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !actionInProgress) setSuspendingDealer(null);
          }}
        >
          <div
            className="animate-fade-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 480,
              padding: 24,
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#f87171', marginBottom: 16 }}>
              <AlertTriangleIcon style={{ width: 24, height: 24 }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Confirm Dealer Suspension</h3>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              Are you sure you want to suspend <strong>{suspendingDealer.businessName}</strong> ({suspendingDealer.dealerCode})?
            </p>

            <div
              style={{
                padding: 12,
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                marginBottom: 20,
              }}
            >
              <strong style={{ color: '#fbbf24' }}>Important distinction:</strong> Suspending marks this dealer record as suspended in the directory and inventory workflows. Note that this record update does not automatically revoke Firebase Authentication credentials until dedicated backend authorization rules enforce it.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSuspendingDealer(null)}
                disabled={actionInProgress}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0 16px',
                  height: 38,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: actionInProgress ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                disabled={actionInProgress}
                onClick={handleConfirmSuspend}
              >
                {actionInProgress ? (
                  <>
                    <SpinnerIcon style={{ width: 14, height: 14 }} className="animate-spin" />
                    <span>Suspending...</span>
                  </>
                ) : (
                  <span>Confirm Suspension</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Permanent Deletion Confirmation Modal */}
      {deletingDealer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(6px)',
            zIndex: 110,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !actionInProgress) setDeletingDealer(null);
          }}
        >
          <div
            className="animate-fade-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 480,
              padding: 24,
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#f87171', marginBottom: 16 }}>
              <TrashIcon style={{ width: 24, height: 24 }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Delete Dealer Record</h3>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
              Are you sure you want to permanently delete dealer <strong>{deletingDealer.businessName}</strong> ({deletingDealer.dealerCode}) from Cloud Firestore? This action cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeletingDealer(null)}
                disabled={actionInProgress}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0 16px',
                  height: 38,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: actionInProgress ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                disabled={actionInProgress}
                onClick={handleConfirmDelete}
              >
                {actionInProgress ? (
                  <>
                    <SpinnerIcon style={{ width: 14, height: 14 }} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Permanently Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
