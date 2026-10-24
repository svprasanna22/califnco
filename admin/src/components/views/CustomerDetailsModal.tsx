import { useEffect, useState } from 'react';
import type { CustomerRecord } from '../../services/customerService';
import { formatINR, isOrderVerifiedPaid } from '../../services/customerService';
import type { Order, OrderFulfillmentStatus } from '../../services/orderService';
import {
  CloseIcon,
  CopyIcon,
  CheckCircleIcon,
  OrdersIcon,
  RupeeIcon,
  AlertTriangleIcon,
} from '../common/Icons';

interface CustomerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerRecord | null;
}

export function CustomerDetailsModal({
  isOpen,
  onClose,
  customer,
}: CustomerDetailsModalProps) {
  const [copiedUid, setCopiedUid] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !customer) return null;

  const handleCopyUid = () => {
    navigator.clipboard.writeText(customer.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  const formatDate = (d: Date | null) => {
    if (!d) return 'N/A';
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFulfillmentBadge = (status?: OrderFulfillmentStatus) => {
    switch (status) {
      case 'installed':
        return { label: 'Installed & Verified', className: 'status-success' };
      case 'out_for_installation':
        return { label: 'Out for Install', className: 'status-info' };
      case 'dispatched':
        return { label: 'Dispatched', className: 'status-info' };
      case 'processing':
        return { label: 'Processing', className: 'status-info' };
      case 'cancelled':
        return { label: 'Cancelled', className: 'status-danger' };
      case 'pending':
      default:
        return { label: 'Pending Fulfillment', className: 'status-warning' };
    }
  };

  const getPaymentBadge = (order: Order) => {
    const p = order.payment;
    if (!p) return { label: 'Unknown', className: 'status-warning' };

    if (p.method === 'cash_on_delivery') {
      if (p.status === 'paid' || p.collectedByTechnician) {
        return { label: 'COD Collected', className: 'status-success' };
      }
      return { label: 'COD Pending', className: 'status-warning' };
    }

    switch (p.status) {
      case 'paid':
        return { label: 'Paid (Online)', className: 'status-success' };
      case 'failed':
        return { label: 'Payment Failed', className: 'status-danger' };
      case 'refunded':
        return { label: 'Refunded', className: 'status-info' };
      case 'pending':
      default:
        return { label: 'Payment Pending', className: 'status-warning' };
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-card)',
          borderRadius: 20,
          width: '100%',
          maxWidth: 900,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 30px rgba(6, 182, 212, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '24px 28px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            background: 'rgba(0, 0, 0, 0.25)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{customer.name}</h2>
              <span className="status-badge status-info" style={{ fontSize: 11 }}>
                <OrdersIcon style={{ width: 12, height: 12 }} />
                {customer.totalOrders} Order{customer.totalOrders === 1 ? '' : 's'}
              </span>
              <span className="status-badge status-success" style={{ fontSize: 11 }}>
                <RupeeIcon style={{ width: 12, height: 12 }} />
                {formatINR(customer.verifiedSpending)} Verified Spend
              </span>
            </div>

            {/* UID Bar with Copy */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--cyan-primary)',
              }}
            >
              <span>UID: {customer.uid}</span>
              <button
                type="button"
                onClick={handleCopyUid}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: copiedUid ? '#34d399' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  padding: 0,
                }}
                title="Copy Customer UID"
              >
                {copiedUid ? (
                  <>
                    <CheckCircleIcon style={{ width: 12, height: 12 }} />
                    <span style={{ fontSize: 10 }}>Copied</span>
                  </>
                ) : (
                  <CopyIcon style={{ width: 12, height: 12 }} />
                )}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            style={{ width: 36, height: 36, padding: 0, borderRadius: '50%' }}
            aria-label="Close modal"
          >
            <CloseIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Customer Profile Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            {/* Email */}
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Email Address
              </div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600 }}>
                {customer.email ? (
                  <a
                    href={`mailto:${customer.email}`}
                    style={{ color: 'var(--cyan-primary)', textDecoration: 'none' }}
                  >
                    {customer.email}
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Not Provided</span>
                )}
              </div>
            </div>

            {/* Phone */}
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Phone Number
              </div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600 }}>
                {customer.phone ? (
                  <a
                    href={`tel:${customer.phone}`}
                    style={{ color: '#fff', textDecoration: 'none' }}
                  >
                    {customer.phone}
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Not Provided</span>
                )}
              </div>
            </div>

            {/* First Order */}
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                First Order Date
              </div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {formatDate(customer.firstOrderDate)}
              </div>
            </div>

            {/* Last Active */}
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Most Recent Order
              </div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: '#fff' }}>
                {formatDate(customer.lastOrderDate)}
              </div>
            </div>
          </div>

          {/* Shipping Addresses Section */}
          {customer.shippingAddresses.length > 0 && (
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 14,
                padding: '18px 20px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                Recorded Shipping Destinations ({customer.shippingAddresses.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {customer.shippingAddresses.map((addr, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#fff' }}>{addr.street || 'Address'}</div>
                    {addr.landmark && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Landmark: {addr.landmark}</div>
                    )}
                    <div>
                      {addr.city ? `${addr.city}, ` : ''}
                      {addr.state ? `${addr.state} ` : ''}
                      {addr.postalCode ? `- ${addr.postalCode}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--teal-primary)' }}>{addr.country || 'India'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customer Order History Section */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                Order History ({customer.orders.length})
              </h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {customer.verifiedOrdersCount} settled verified order{customer.verifiedOrdersCount === 1 ? '' : 's'}
              </span>
            </div>

            {customer.orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                No recorded orders found for this customer.
              </div>
            ) : (
              <div className="table-responsive" style={{ border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Date</th>
                      <th>Items Purchased</th>
                      <th>Order Total</th>
                      <th>Payment Status</th>
                      <th>Fulfillment</th>
                      <th>Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.orders.map((ord) => {
                      const { isVerified, amount, reason } = isOrderVerifiedPaid(ord);
                      const paymentBadge = getPaymentBadge(ord);
                      const fulfillmentBadge = getFulfillmentBadge(ord.fulfillment?.status);
                      const itemsCount = Array.isArray(ord.items)
                        ? ord.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)
                        : 0;

                      return (
                        <tr key={ord.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cyan-primary)' }}>
                            {ord.orderNumber || ord.id.slice(0, 8)}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {formatDate(ord.createdAt ? (ord.createdAt as any).toDate ? (ord.createdAt as any).toDate() : new Date(ord.createdAt as any) : null)}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>
                              {itemsCount} item{itemsCount === 1 ? '' : 's'}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--text-muted)',
                                maxWidth: 220,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={ord.items?.map((i) => `${i.name} (x${i.quantity})`).join(', ')}
                            >
                              {ord.items?.map((i) => i.name).join(', ') || 'Water Purifier'}
                            </div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {formatINR(ord.pricing?.totalAmount || 0)}
                          </td>
                          <td>
                            <span className={`status-badge ${paymentBadge.className}`}>
                              {paymentBadge.label}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${fulfillmentBadge.className}`}>
                              {fulfillmentBadge.label}
                            </span>
                          </td>
                          <td>
                            {isVerified ? (
                              <span
                                className="status-badge status-success"
                                style={{ fontSize: 10 }}
                                title={`${reason}: ${formatINR(amount)}`}
                              >
                                ✓ {formatINR(amount)}
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-muted)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                                title={reason}
                              >
                                <AlertTriangleIcon style={{ width: 12, height: 12, color: 'var(--amber-primary)' }} />
                                Excluded
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 28px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <button type="button" className="btn-secondary" onClick={onClose} style={{ height: 40, padding: '0 24px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
