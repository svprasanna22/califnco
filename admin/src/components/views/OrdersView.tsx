import { useState, useEffect, useCallback } from 'react';
import {
  fetchOrders,
  createAdminTestOrder,
  removeTestOrder,
  type Order,
  type OrderFulfillmentStatus,
  type OrderPaymentStatus,
} from '../../services/orderService';
import { formatINR } from '../../services/productService';
import { useAuth } from '../../context/AuthContext';
import { OrderDetailsModal } from './OrderDetailsModal';
import {
  OrdersIcon,
  SearchIcon,
  RefreshIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  EyeIcon,
  TrashIcon,
  PlusIcon,
} from '../common/Icons';

export function OrdersView() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Test Order Actions
  const [isCreatingTestOrder, setIsCreatingTestOrder] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<OrderFulfillmentStatus | 'all'>('all');
  const [paymentFilter, setPaymentFilter] = useState<OrderPaymentStatus | 'all'>('all');

  // Selected Order for Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrders();
      setOrders(data);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to load orders from Cloud Firestore.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateTestOrder = async () => {
    if (isCreatingTestOrder) return;
    if (!user?.uid) {
      setError('Administrator session not found. Please re-authenticate.');
      return;
    }

    setIsCreatingTestOrder(true);
    setError(null);
    try {
      const newOrderId = await createAdminTestOrder(user.uid);
      showSuccess(`Live test order created successfully (ID: ${newOrderId.slice(0, 8)}...).`);
      await loadOrders();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to create live test order in Cloud Firestore.';
      setError(msg);
    } finally {
      setIsCreatingTestOrder(false);
    }
  };

  const handleDeleteTestOrder = async (order: Order) => {
    if (!order.isTestOrder) {
      setError('Security check failed: Only verified test orders can be deleted.');
      return;
    }

    setDeletingOrderId(order.id);
    setError(null);
    try {
      await removeTestOrder(order);
      showSuccess(`Test order ${order.orderNumber || order.id} permanently removed.`);
      setConfirmDeleteId(null);
      await loadOrders();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to delete test order.');
    } finally {
      setDeletingOrderId(null);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleOpenDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleOrderUpdated = async () => {
    showSuccess('Order updated successfully.');
    await loadOrders();
    if (selectedOrder) {
      // Re-sync current modal view
      const updated = orders.find((o) => o.id === selectedOrder.id);
      if (updated) setSelectedOrder(updated);
    }
  };

  // Filtered orders list
  const filteredOrders = orders.filter((order) => {
    const matchesFulfillment =
      fulfillmentFilter === 'all' || order.fulfillment.status === fulfillmentFilter;
    const matchesPayment =
      paymentFilter === 'all' || order.payment.status === paymentFilter;

    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (order.orderNumber || order.id).toLowerCase().includes(term) ||
      order.customer.name.toLowerCase().includes(term) ||
      order.customer.phone.toLowerCase().includes(term) ||
      order.shippingAddress.city.toLowerCase().includes(term);

    return matchesFulfillment && matchesPayment && matchesSearch;
  });

  const getFulfillmentBadge = (status: OrderFulfillmentStatus) => {
    switch (status) {
      case 'installed':
        return <span className="status-badge status-success">Installed & Verified</span>;
      case 'out_for_installation':
        return <span className="status-badge status-warning">Installation Tech Assigned</span>;
      case 'dispatched':
        return <span className="status-badge status-info">Dispatched</span>;
      case 'processing':
        return <span className="status-badge status-info">Processing</span>;
      case 'cancelled':
        return <span className="status-badge status-danger">Cancelled</span>;
      case 'pending':
      default:
        return <span className="status-badge status-warning">Pending</span>;
    }
  };

  const getPaymentBadge = (status: OrderPaymentStatus) => {
    switch (status) {
      case 'paid':
        return <span className="status-badge status-success">PAID</span>;
      case 'cash_on_delivery':
        return <span className="status-badge status-warning">COD</span>;
      case 'failed':
        return <span className="status-badge status-danger">FAILED</span>;
      case 'refunded':
        return <span className="status-badge status-danger">REFUNDED</span>;
      case 'pending':
      default:
        return <span className="status-badge status-info">PENDING</span>;
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
              onClick={loadOrders}
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
            <h2 className="section-panel-title">Customer Orders & Installations</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Live customer purifier deliveries and field technician installation lifecycle.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={handleCreateTestOrder}
              className="btn-secondary"
              disabled={isCreatingTestOrder || loading}
              title="Create live test order in Cloud Firestore"
              style={{ fontSize: 12, height: 36, gap: 6 }}
            >
              {isCreatingTestOrder ? (
                <SpinnerIcon style={{ width: 14, height: 14 }} className="animate-spin" />
              ) : (
                <PlusIcon style={{ width: 14, height: 14, color: 'var(--cyan-primary)' }} />
              )}
              <span>Create Live Test Order</span>
            </button>
            <button
              onClick={loadOrders}
              className="btn-secondary"
              disabled={loading}
              title="Refresh orders from Firestore"
              aria-label="Refresh orders"
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
              placeholder="Search by order ID, customer, phone, city..."
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

          {/* Payment Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Payment:</span>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as OrderPaymentStatus | 'all')}
              className="form-input"
              style={{ height: 36, padding: '0 12px', fontSize: 12, width: 140, cursor: 'pointer' }}
            >
              <option value="all">All Payments</option>
              <option value="paid">Paid</option>
              <option value="cash_on_delivery">Cash on Delivery</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>

        {/* Fulfillment Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
          {(
            [
              { key: 'all', label: 'All Stages' },
              { key: 'pending', label: 'Pending' },
              { key: 'processing', label: 'Processing' },
              { key: 'dispatched', label: 'Dispatched' },
              { key: 'out_for_installation', label: 'Out for Installation' },
              { key: 'installed', label: 'Installed' },
              { key: 'cancelled', label: 'Cancelled' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              className="btn-secondary"
              style={{
                background: fulfillmentFilter === tab.key ? 'var(--cyan-glow)' : undefined,
                borderColor: fulfillmentFilter === tab.key ? 'var(--cyan-primary)' : undefined,
                color: fulfillmentFilter === tab.key ? '#fff' : undefined,
                fontSize: 12,
                height: 34,
                whiteSpace: 'nowrap',
              }}
              onClick={() => setFulfillmentFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Orders Table & Dynamic States */}
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <SpinnerIcon style={{ width: 28, height: 28, color: 'var(--cyan-primary)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 500 }}>Loading orders from Cloud Firestore...</div>
          </div>
        ) : filteredOrders.length === 0 ? (
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
              <OrdersIcon style={{ width: 24, height: 24 }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 6 }}>
              {orders.length === 0 ? 'No Orders in Firestore Collection' : 'No Matching Orders'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto' }}>
              {orders.length === 0
                ? 'Your Cloud Firestore orders collection is currently empty. Orders placed via the customer mobile app or web storefront will appear here automatically.'
                : 'Try adjusting your search keywords or switching fulfillment and payment filters.'}
            </p>
            {orders.length === 0 && (
              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 22px',
                    height: 42,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  disabled={isCreatingTestOrder || loading}
                  onClick={handleCreateTestOrder}
                >
                  {isCreatingTestOrder ? (
                    <>
                      <SpinnerIcon style={{ width: 16, height: 16 }} className="animate-spin" />
                      <span>Creating Live Test Order...</span>
                    </>
                  ) : (
                    <>
                      <PlusIcon style={{ width: 16, height: 16 }} />
                      <span>Create Live Test Order (Uses Firestore Product)</span>
                    </>
                  )}
                </button>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                  Admin QA Action • Uses actual product price from Firestore • Sets <code style={{ color: '#fbbf24' }}>isTestOrder: true</code>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order Ref</th>
                  <th>Date</th>
                  <th>Customer & Destination</th>
                  <th>Items Summary</th>
                  <th>Payment</th>
                  <th>Total Amount</th>
                  <th>Fulfillment Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fff' }}>
                          {order.orderNumber || order.id}
                        </span>
                        {order.isTestOrder && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              fontWeight: 700,
                              letterSpacing: '0.05em',
                            }}
                          >
                            TEST
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {order.id.slice(0, 8)}...
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {formatDate(order.createdAt)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{order.customer.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{order.customer.phone}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {order.shippingAddress.city}, {order.shippingAddress.state}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {order.items.length > 0
                          ? `${order.items[0].name}${order.items.length > 1 ? ` +${order.items.length - 1} more` : ''}`
                          : 'No items'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {order.items.reduce((acc, item) => acc + item.quantity, 0)} total unit(s)
                      </div>
                    </td>
                    <td>{getPaymentBadge(order.payment.status)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--cyan-primary)', fontSize: 14 }}>
                      {formatINR(order.pricing.totalAmount)}
                    </td>
                    <td>{getFulfillmentBadge(order.fulfillment.status)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          onClick={() => handleOpenDetails(order)}
                          className="btn-secondary"
                          style={{ padding: '6px 12px', height: 32, fontSize: 12, gap: 6 }}
                          title="View order details"
                        >
                          <EyeIcon style={{ width: 14, height: 14 }} />
                          <span>Manage</span>
                        </button>

                        {order.isTestOrder && (
                          confirmDeleteId === order.id ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <button
                                onClick={() => handleDeleteTestOrder(order)}
                                style={{
                                  background: '#dc2626',
                                  color: '#fff',
                                  border: 'none',
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  borderRadius: 6,
                                  height: 32,
                                  cursor: deletingOrderId === order.id ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontWeight: 600,
                                }}
                                disabled={deletingOrderId === order.id}
                                title="Confirm permanent deletion of this test order"
                              >
                                {deletingOrderId === order.id ? '...' : 'Confirm Delete'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="btn-secondary"
                                style={{ padding: '4px 8px', fontSize: 11, height: 32 }}
                                disabled={deletingOrderId === order.id}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(order.id)}
                              className="btn-secondary"
                              style={{
                                padding: '6px 8px',
                                height: 32,
                                fontSize: 12,
                                borderColor: 'rgba(239, 68, 68, 0.4)',
                                color: '#f87171',
                              }}
                              title="Delete test order from Firestore"
                            >
                              <TrashIcon style={{ width: 14, height: 14 }} />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Details & Management Modal */}
      <OrderDetailsModal
        isOpen={isModalOpen}
        order={selectedOrder}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedOrder(null);
        }}
        onOrderUpdated={handleOrderUpdated}
      />
    </div>
  );
}
