import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchCustomers,
  formatINR,
  type CustomerRecord,
} from '../../services/customerService';
import { CustomerDetailsModal } from './CustomerDetailsModal';
import {
  UsersIcon,
  SearchIcon,
  RefreshIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  OrdersIcon,
  RupeeIcon,
  EyeIcon,
  CopyIcon,
  CheckCircleIcon,
} from '../common/Icons';

export function CustomersView() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [spendFilter, setSpendFilter] = useState<'all' | 'with_spending' | 'zero_spending'>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<'all' | 'repeat' | 'single'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'spend_desc' | 'orders_desc' | 'name_asc'>('recent');

  // Selected customer for modal drilldown
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const loadCustomers = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await fetchCustomers();
      setCustomers(data);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to load customer records from Cloud Firestore.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleCopyUid = (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(uid);
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 2000);
  };

  const handleOpenDetails = (customer: CustomerRecord) => {
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };

  const handleCloseDetails = () => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
  };

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalCustomers = customers.length;
    let customersWithSpend = 0;
    let repeatBuyers = 0;
    let totalVerifiedSpend = 0;

    for (const c of customers) {
      if (c.verifiedSpending > 0) customersWithSpend++;
      if (c.totalOrders > 1) repeatBuyers++;
      totalVerifiedSpend += c.verifiedSpending;
    }

    return {
      totalCustomers,
      customersWithSpend,
      repeatBuyers,
      totalVerifiedSpend,
    };
  }, [customers]);

  // Filtered & Sorted Customer List
  const filteredCustomers = useMemo(() => {
    let result = customers.filter((c) => {
      // 1. Text search across Name, Email, UID, and Phone
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesEmail = c.email.toLowerCase().includes(query);
        const matchesUid = c.uid.toLowerCase().includes(query);
        const matchesPhone = c.phone.toLowerCase().includes(query);
        const matchesCity = c.shippingAddresses.some((a) =>
          a.city?.toLowerCase().includes(query)
        );
        if (!matchesName && !matchesEmail && !matchesUid && !matchesPhone && !matchesCity) {
          return false;
        }
      }

      // 2. Spending Filter
      if (spendFilter === 'with_spending' && c.verifiedSpending <= 0) return false;
      if (spendFilter === 'zero_spending' && c.verifiedSpending > 0) return false;

      // 3. Frequency Filter
      if (frequencyFilter === 'repeat' && c.totalOrders <= 1) return false;
      if (frequencyFilter === 'single' && c.totalOrders !== 1) return false;

      return true;
    });

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'spend_desc':
          return b.verifiedSpending - a.verifiedSpending;
        case 'orders_desc':
          return b.totalOrders - a.totalOrders;
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'recent':
        default: {
          const timeB = b.lastOrderDate ? b.lastOrderDate.getTime() : 0;
          const timeA = a.lastOrderDate ? a.lastOrderDate.getTime() : 0;
          return timeB - timeA;
        }
      }
    });

    return result;
  }, [customers, searchTerm, spendFilter, frequencyFilter, sortBy]);

  const formatDate = (d: Date | null) => {
    if (!d) return 'N/A';
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

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
              Customer Directory
            </h1>
            <span className="status-badge status-info" style={{ fontSize: 11 }}>
              <UsersIcon style={{ width: 12, height: 12 }} />
              {metrics.totalCustomers} Unique Buyer{metrics.totalCustomers === 1 ? '' : 's'}
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Aggregated & deduplicated customer profiles derived from authoritative Firestore order history.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={() => loadCustomers(true)}
            disabled={loading || refreshing}
            style={{ height: 38, fontSize: 13 }}
            title="Refresh customer profiles from Cloud Firestore"
          >
            {refreshing ? (
              <>
                <SpinnerIcon style={{ width: 15, height: 15 }} />
                <span>Refreshing...</span>
              </>
            ) : (
              <>
                <RefreshIcon style={{ width: 15, height: 15 }} />
                <span>Refresh</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div
          style={{
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            color: '#fb7185',
            fontSize: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangleIcon style={{ width: 20, height: 20, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => loadCustomers(true)}
            style={{ height: 32, padding: '0 12px', fontSize: 12, borderColor: 'rgba(244, 63, 94, 0.4)' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Quick Aggregate Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="stat-card">
              <div className="skeleton-box" style={{ width: 100, height: 14, marginBottom: 12 }} />
              <div className="skeleton-box" style={{ width: 120, height: 30, marginBottom: 8 }} />
              <div className="skeleton-box" style={{ width: 150, height: 12 }} />
            </div>
          ))
        ) : (
          <>
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Total Purchasing Customers</span>
                <div className="stat-icon-wrapper" style={{ color: 'var(--cyan-primary)', background: 'rgba(6, 182, 212, 0.1)' }}>
                  <UsersIcon style={{ width: 18, height: 18 }} />
                </div>
              </div>
              <div className="stat-value">{metrics.totalCustomers}</div>
              <div className="stat-subtext">Deduplicated across order records</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Active Verified Buyers</span>
                <div className="stat-icon-wrapper" style={{ color: 'var(--emerald-primary)', background: 'rgba(16, 185, 129, 0.1)' }}>
                  <CheckCircleIcon style={{ width: 18, height: 18 }} />
                </div>
              </div>
              <div className="stat-value">{metrics.customersWithSpend}</div>
              <div className="stat-subtext">
                {metrics.totalCustomers > 0
                  ? `${((metrics.customersWithSpend / metrics.totalCustomers) * 100).toFixed(0)}% conversion rate`
                  : 'Awaiting verified payments'}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Repeat Buyers</span>
                <div className="stat-icon-wrapper" style={{ color: 'var(--teal-primary)', background: 'rgba(20, 184, 166, 0.1)' }}>
                  <OrdersIcon style={{ width: 18, height: 18 }} />
                </div>
              </div>
              <div className="stat-value">{metrics.repeatBuyers}</div>
              <div className="stat-subtext">Customers with 2 or more orders</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-label">Total Verified Spend</span>
                <div className="stat-icon-wrapper" style={{ color: 'var(--emerald-primary)', background: 'rgba(16, 185, 129, 0.1)' }}>
                  <RupeeIcon style={{ width: 18, height: 18 }} />
                </div>
              </div>
              <div className="stat-value">{formatINR(metrics.totalVerifiedSpend)}</div>
              <div className="stat-subtext">Settled Razorpay & collected COD</div>
            </div>
          </>
        )}
      </div>

      {/* Main Section Panel: Filters & Customer Table */}
      <div className="section-panel" style={{ marginBottom: 0 }}>
        {/* Search & Filters Controls */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 20,
          }}
        >
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420 }}>
            <SearchIcon
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search by name, email, phone, UID, or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ paddingLeft: 38, height: 42 }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Spend Filter */}
            <select
              value={spendFilter}
              onChange={(e) => setSpendFilter(e.target.value as any)}
              className="form-input"
              style={{ height: 42, width: 'auto', padding: '0 12px' }}
            >
              <option value="all">All Spending</option>
              <option value="with_spending">Has Verified Spend (&gt; ₹0)</option>
              <option value="zero_spending">Zero Verified Spend (₹0)</option>
            </select>

            {/* Frequency Filter */}
            <select
              value={frequencyFilter}
              onChange={(e) => setFrequencyFilter(e.target.value as any)}
              className="form-input"
              style={{ height: 42, width: 'auto', padding: '0 12px' }}
            >
              <option value="all">All Order Frequencies</option>
              <option value="repeat">Repeat Buyers (≥ 2 orders)</option>
              <option value="single">Single Order (1 order)</option>
            </select>

            {/* Sort Options */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="form-input"
              style={{ height: 42, width: 'auto', padding: '0 12px' }}
            >
              <option value="recent">Sort by Most Recent Active</option>
              <option value="spend_desc">Sort by Verified Spend (High to Low)</option>
              <option value="orders_desc">Sort by Total Orders</option>
              <option value="name_asc">Sort by Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Customer Directory Table */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="skeleton-box" style={{ width: '100%', height: 54, borderRadius: 8 }} />
            ))}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
            <UsersIcon style={{ width: 44, height: 44, margin: '0 auto 12px auto', opacity: 0.3 }} />
            {customers.length === 0 ? (
              <>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  No customer records found in Firestore.
                </p>
                <p style={{ fontSize: 13, marginTop: 4 }}>
                  Customer records are automatically derived when orders are placed via mobile checkout or the test order generator.
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  No customers match your search or filter criteria.
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setSearchTerm('');
                    setSpendFilter('all');
                    setFrequencyFilter('all');
                  }}
                  style={{ marginTop: 14 }}
                >
                  Reset Filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact Details</th>
                  <th>Primary City</th>
                  <th>Total Orders</th>
                  <th>Verified Spend</th>
                  <th>Last Active</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((cust) => {
                  const primaryCity = cust.shippingAddresses[0]?.city || 'N/A';
                  const primaryState = cust.shippingAddresses[0]?.state;

                  return (
                    <tr
                      key={cust.uid}
                      onClick={() => handleOpenDetails(cust)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>
                          {cust.name}
                        </div>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 2,
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--cyan-primary)',
                          }}
                        >
                          <span>UID: {cust.uid.slice(0, 10)}...</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyUid(cust.uid, e)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: copiedUid === cust.uid ? '#34d399' : 'var(--text-muted)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              padding: 0,
                            }}
                            title="Copy UID"
                          >
                            {copiedUid === cust.uid ? (
                              <CheckCircleIcon style={{ width: 11, height: 11 }} />
                            ) : (
                              <CopyIcon style={{ width: 11, height: 11 }} />
                            )}
                          </button>
                        </div>
                      </td>

                      <td>
                        {cust.email ? (
                          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{cust.email}</div>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email not provided</div>
                        )}
                        {cust.phone ? (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {cust.phone}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Phone not provided</div>
                        )}
                      </td>

                      <td>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{primaryCity}</div>
                        {primaryState && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{primaryState}</div>
                        )}
                      </td>

                      <td>
                        <span className="status-badge status-info" style={{ fontSize: 11 }}>
                          <OrdersIcon style={{ width: 11, height: 11 }} />
                          {cust.totalOrders} Order{cust.totalOrders === 1 ? '' : 's'}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: cust.verifiedSpending > 0 ? '#34d399' : 'var(--text-muted)' }}>
                          {formatINR(cust.verifiedSpending)}
                        </div>
                        {cust.verifiedOrdersCount > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {cust.verifiedOrdersCount} settled order{cust.verifiedOrdersCount === 1 ? '' : 's'}
                          </div>
                        )}
                      </td>

                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {formatDate(cust.lastOrderDate)}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetails(cust);
                          }}
                          style={{ height: 32, fontSize: 12, padding: '0 12px' }}
                          title="View complete customer profile and order history"
                        >
                          <span>View History</span>
                          <EyeIcon style={{ width: 13, height: 13 }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Profile & History Modal */}
      <CustomerDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseDetails}
        customer={selectedCustomer}
      />
    </div>
  );
}
