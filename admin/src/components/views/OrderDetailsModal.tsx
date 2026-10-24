import { useState } from 'react';
import type {
  Order,
  OrderFulfillmentStatus,
  FulfillmentUpdateParams,
} from '../../services/orderService';
import {
  updateOrderFulfillment,
  recordCODCollection,
  removeTestOrder,
  ALLOWED_FULFILLMENT_TRANSITIONS,
} from '../../services/orderService';
import { formatINR } from '../../services/productService';
import { useAuth } from '../../context/AuthContext';
import {
  CloseIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ProductsIcon,
  TrashIcon,
} from '../common/Icons';

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: () => Promise<void>;
}

export function OrderDetailsModal({
  order,
  isOpen,
  onClose,
  onOrderUpdated,
}: OrderDetailsModalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'details' | 'fulfillment' | 'payment'>('details');

  // Fulfillment update state
  const [targetStatus, setTargetStatus] = useState<OrderFulfillmentStatus | ''>('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [technicianPhone, setTechnicianPhone] = useState('');
  const [tdsReading, setTdsReading] = useState('');
  const [installationNotes, setInstallationNotes] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  // COD collection state
  const [codAmount, setCodAmount] = useState('');
  const [codNotes, setCodNotes] = useState('');

  // Execution states
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Test Order Cleanup state
  const [confirmingDeleteTest, setConfirmingDeleteTest] = useState(false);
  const [isDeletingTest, setIsDeletingTest] = useState(false);

  if (!isOpen || !order) return null;

  const currentFulfillmentStatus = order.fulfillment.status;
  const availableNextStatuses = ALLOWED_FULFILLMENT_TRANSITIONS[currentFulfillmentStatus] || [];
  const isTerminalState = availableNextStatuses.length === 0;

  const handleUpdateFulfillment = async () => {
    if (!targetStatus) return;
    setActionError(null);
    setActionSuccess(null);
    setIsUpdating(true);

    try {
      const params: FulfillmentUpdateParams = {
        targetStatus,
        carrier: carrier.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        technicianName: technicianName.trim() || undefined,
        technicianPhone: technicianPhone.trim() || undefined,
        tdsReading: tdsReading ? Number(tdsReading) : undefined,
        installationNotes: installationNotes.trim() || undefined,
        cancellationReason: cancellationReason.trim() || undefined,
        generalNotes: generalNotes.trim() || undefined,
      };

      if (!user?.uid) {
        throw new Error('Administrator authentication session not found. Please re-authenticate.');
      }
      await updateOrderFulfillment(order, params, user.uid);
      setActionSuccess(`Fulfillment status updated to "${targetStatus}".`);
      setTargetStatus('');
      await onOrderUpdated();
    } catch (err: unknown) {
      setActionError((err as Error)?.message || 'Failed to update order fulfillment.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRecordCOD = async () => {
    setActionError(null);
    setActionSuccess(null);
    setIsUpdating(true);

    try {
      const amount = codAmount ? Number(codAmount) : order.pricing.totalAmount;
      if (!user?.uid) {
        throw new Error('Administrator authentication session not found. Please re-authenticate.');
      }
      await recordCODCollection(order, amount, codNotes, user.uid);
      setActionSuccess(`COD collection of ${formatINR(amount)} recorded successfully.`);
      await onOrderUpdated();
    } catch (err: unknown) {
      setActionError((err as Error)?.message || 'Failed to record COD collection.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTestOrder = async () => {
    if (!order.isTestOrder) return;
    setActionError(null);
    setIsDeletingTest(true);
    try {
      await removeTestOrder(order);
      await onOrderUpdated();
      onClose();
    } catch (err: unknown) {
      setActionError((err as Error)?.message || 'Failed to delete test order.');
      setIsDeletingTest(false);
      setConfirmingDeleteTest(false);
    }
  };

  const formatDate = (dateVal: any) => {
    if (!dateVal) return 'N/A';
    try {
      if (dateVal.toDate) return dateVal.toDate().toLocaleString('en-IN');
      return new Date(dateVal).toLocaleString('en-IN');
    } catch {
      return 'N/A';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUpdating) onClose();
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-card)',
          borderRadius: 20,
          width: '100%',
          maxWidth: 780,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(6, 182, 212, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                Order {order.orderNumber || order.id}
              </h2>
              <span
                className={`status-badge ${
                  order.fulfillment.status === 'installed'
                    ? 'status-success'
                    : order.fulfillment.status === 'cancelled'
                    ? 'status-danger'
                    : 'status-info'
                }`}
              >
                {order.fulfillment.status.replace(/_/g, ' ').toUpperCase()}
              </span>
              {order.isTestOrder && (
                <span
                  className="status-badge status-warning"
                  style={{
                    background: 'rgba(245, 158, 11, 0.2)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    fontSize: 10,
                  }}
                >
                  TEST ORDER
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Placed on {formatDate(order.createdAt)} • ID: {order.id}
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={isUpdating}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
            }}
            aria-label="Close modal"
          >
            <CloseIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '0 24px',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          {(
            [
              { key: 'details', label: 'Order Summary & Items' },
              { key: 'fulfillment', label: 'Fulfillment & Installation' },
              { key: 'payment', label: 'Payment Information' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setActionError(null);
                setActionSuccess(null);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--cyan-primary)' : '2px solid transparent',
                color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.key ? 600 : 500,
                fontSize: 13,
                padding: '14px 18px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {actionSuccess && (
            <div className="banner-alert banner-info" style={{ marginBottom: 16 }}>
              <CheckCircleIcon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2, color: '#34d399' }} />
              <span>{actionSuccess}</span>
            </div>
          )}

          {actionError && (
            <div className="banner-alert banner-error" style={{ marginBottom: 16 }}>
              <AlertTriangleIcon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
              <span>{actionError}</span>
            </div>
          )}

          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Customer & Address Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.25)',
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Customer Details
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginTop: 6 }}>
                    {order.customer.name}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {order.customer.phone}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {order.customer.email}
                  </div>
                  {order.customer.uid && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
                      UID: {order.customer.uid}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.25)',
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Shipping & Doorstep Address
                  </div>
                  <div style={{ fontSize: 13, color: '#fff', marginTop: 6, lineHeight: 1.5 }}>
                    {order.shippingAddress.street}
                    {order.shippingAddress.landmark && `, near ${order.shippingAddress.landmark}`}
                    <br />
                    {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.postalCode}
                    <br />
                    {order.shippingAddress.country || 'India'}
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                  Purchased Products & Cartridges
                </h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Unit Price</th>
                        <th>Qty</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 6,
                                    objectFit: 'cover',
                                    background: '#1e293b',
                                  }}
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <ProductsIcon style={{ width: 20, height: 20, color: 'var(--cyan-primary)' }} />
                              )}
                              <div>
                                <div style={{ fontWeight: 600 }}>{item.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SKU: {item.productId}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(item.price)}</td>
                          <td>{item.quantity}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--cyan-primary)' }}>
                            {formatINR(item.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pricing Breakdown */}
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxWidth: 320,
                  alignSelf: 'flex-end',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)' }}>
                  <span>Subtotal</span>
                  <span>{formatINR(order.pricing.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)' }}>
                  <span>GST (18%)</span>
                  <span>{formatINR(order.pricing.tax)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)' }}>
                  <span>Shipping & Installation</span>
                  <span>{order.pricing.shipping === 0 ? 'FREE' : formatINR(order.pricing.shipping)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#fff',
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: 8,
                  }}
                >
                  <span>Total Amount</span>
                  <span style={{ color: 'var(--cyan-primary)' }}>{formatINR(order.pricing.totalAmount)}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FULFILLMENT & INSTALLATION */}
          {activeTab === 'fulfillment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Current Fulfillment Stage</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 4 }}>
                  {order.fulfillment.status.replace(/_/g, ' ').toUpperCase()}
                </div>

                {order.fulfillment.assignedTechnician && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                    <strong>Assigned Field Technician:</strong> {order.fulfillment.assignedTechnician.name} ({order.fulfillment.assignedTechnician.phone})
                  </div>
                )}

                {order.fulfillment.carrier && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    <strong>Courier / Carrier:</strong> {order.fulfillment.carrier}{' '}
                    {order.fulfillment.trackingNumber && `(Tracking: ${order.fulfillment.trackingNumber})`}
                  </div>
                )}

                {order.fulfillment.installedAt && (
                  <div style={{ fontSize: 13, color: '#34d399', marginTop: 8 }}>
                    <strong>Installed & Certified:</strong> {formatDate(order.fulfillment.installedAt)}
                    <br />
                    <strong>Calibrated TDS Reading:</strong> {order.fulfillment.tdsReading} ppm
                    {order.fulfillment.installationNotes && (
                      <p style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
                        "{order.fulfillment.installationNotes}"
                      </p>
                    )}
                  </div>
                )}

                {order.fulfillment.cancellationReason && (
                  <div style={{ fontSize: 13, color: '#fda4af', marginTop: 8 }}>
                    <strong>Cancellation Reason:</strong> "{order.fulfillment.cancellationReason}"
                  </div>
                )}
              </div>

              {isTerminalState ? (
                <div className="banner-alert banner-info">
                  This order is in a terminal status (<strong>{order.fulfillment.status}</strong>). No further fulfillment transitions are allowed.
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(6, 182, 212, 0.05)',
                    border: '1px solid rgba(6, 182, 212, 0.25)',
                    borderRadius: 12,
                    padding: 20,
                  }}
                >
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                    Advance Fulfillment Pipeline
                  </h4>

                  <div className="form-group">
                    <label className="form-label" htmlFor="target-status">
                      Select Next Allowed Status
                    </label>
                    <select
                      id="target-status"
                      className="form-input"
                      value={targetStatus}
                      onChange={(e) => setTargetStatus(e.target.value as OrderFulfillmentStatus)}
                      disabled={isUpdating}
                    >
                      <option value="">-- Choose next status transition --</option>
                      {availableNextStatuses.map((st) => (
                        <option key={st} value={st} style={{ background: '#0f172a' }}>
                          {st.replace(/_/g, ' ').toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  {targetStatus === 'dispatched' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="carrier-name">Carrier / Transport</label>
                        <input
                          id="carrier-name"
                          type="text"
                          className="form-input"
                          placeholder="e.g. BlueDart / Califnco Fleet"
                          value={carrier}
                          onChange={(e) => setCarrier(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="tracking-num">Tracking / Waybill No.</label>
                        <input
                          id="tracking-num"
                          type="text"
                          className="form-input"
                          placeholder="e.g. BD7829104"
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {targetStatus === 'out_for_installation' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="tech-name">Assigned Technician Name *</label>
                        <input
                          id="tech-name"
                          type="text"
                          className="form-input"
                          placeholder="e.g. Arjun Sharma"
                          value={technicianName}
                          onChange={(e) => setTechnicianName(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="tech-phone">Technician Phone</label>
                        <input
                          id="tech-phone"
                          type="text"
                          className="form-input"
                          placeholder="e.g. +91 98450 12345"
                          value={technicianPhone}
                          onChange={(e) => setTechnicianPhone(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {targetStatus === 'installed' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="tds-val">
                          Calibrated Output Water TDS (ppm) *
                        </label>
                        <input
                          id="tds-val"
                          type="number"
                          className="form-input"
                          placeholder="e.g. 65"
                          value={tdsReading}
                          onChange={(e) => setTdsReading(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="inst-notes">
                          Installation & Handover Verification Notes *
                        </label>
                        <textarea
                          id="inst-notes"
                          rows={2}
                          className="form-input"
                          style={{ height: 'auto', padding: 10 }}
                          placeholder="e.g. RO membrane flushed, pressure tested, customer briefed on alkaline cartridge replacement cycle."
                          value={installationNotes}
                          onChange={(e) => setInstallationNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {targetStatus === 'cancelled' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="cancel-reason" style={{ color: '#fda4af' }}>
                        Required Cancellation Reason *
                      </label>
                      <textarea
                        id="cancel-reason"
                        rows={2}
                        className="form-input"
                        style={{ height: 'auto', padding: 10, borderColor: 'rgba(244, 63, 94, 0.4)' }}
                        placeholder="e.g. Customer cancelled due to relocation / duplicate order."
                        value={cancellationReason}
                        onChange={(e) => setCancellationReason(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" htmlFor="gen-notes">Internal Operation Notes (Optional)</label>
                    <input
                      id="gen-notes"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Customer requested evening installation slot."
                      value={generalNotes}
                      onChange={(e) => setGeneralNotes(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn-primary"
                    style={{ width: 'auto', padding: '0 20px', height: 40 }}
                    onClick={handleUpdateFulfillment}
                    disabled={isUpdating || !targetStatus}
                  >
                    {isUpdating ? (
                      <>
                        <SpinnerIcon style={{ width: 16, height: 16 }} />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <span>Apply Fulfillment Transition</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PAYMENT */}
          {activeTab === 'payment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Payment Method</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', textTransform: 'uppercase', marginTop: 2 }}>
                      {order.payment.method.replace(/_/g, ' ')}
                    </div>
                  </div>

                  <span
                    className={`status-badge ${
                      order.payment.status === 'paid'
                        ? 'status-success'
                        : order.payment.status === 'cash_on_delivery'
                        ? 'status-warning'
                        : order.payment.status === 'failed'
                        ? 'status-danger'
                        : 'status-info'
                    }`}
                  >
                    {order.payment.status.toUpperCase()}
                  </span>
                </div>

                {order.payment.transactionId && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>
                    <strong>Gateway Transaction ID:</strong>{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan-primary)' }}>
                      {order.payment.transactionId}
                    </span>
                  </div>
                )}

                {order.payment.paidAt && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    <strong>Verified Paid At:</strong> {formatDate(order.payment.paidAt)}
                  </div>
                )}

                {order.payment.collectedByTechnician && (
                  <div style={{ marginTop: 12, padding: 12, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <div style={{ color: '#34d399', fontWeight: 600, fontSize: 13 }}>
                      ✓ Cash on Delivery Collected by Field Technician
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      Amount: {formatINR(order.payment.collectedAmount || order.pricing.totalAmount)}
                      {order.payment.collectedAt && ` • Collected: ${formatDate(order.payment.collectedAt)}`}
                    </div>
                    {order.payment.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Notes: {order.payment.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Safety notice for Gateway vs COD */}
              {order.payment.method === 'cash_on_delivery' && !order.payment.collectedByTechnician ? (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 12,
                    padding: 20,
                  }}
                >
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', marginBottom: 8 }}>
                    Field Cash on Delivery Collection
                  </h4>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
                    This order is marked as Cash on Delivery. Once the installation technician collects cash from the customer, record the collection here.
                  </p>

                  <div className="form-group">
                    <label className="form-label" htmlFor="cod-amount">
                      Collected Amount (INR ₹)
                    </label>
                    <input
                      id="cod-amount"
                      type="number"
                      className="form-input"
                      placeholder={String(order.pricing.totalAmount)}
                      value={codAmount}
                      onChange={(e) => setCodAmount(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="cod-notes">
                      Collection Notes & Technician Signoff
                    </label>
                    <input
                      id="cod-notes"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Cash handed over to technician Arjun Sharma during RO setup."
                      value={codNotes}
                      onChange={(e) => setCodNotes(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn-primary"
                    style={{ width: 'auto', padding: '0 20px', height: 40 }}
                    onClick={handleRecordCOD}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <>
                        <SpinnerIcon style={{ width: 16, height: 16 }} />
                        <span>Recording...</span>
                      </>
                    ) : (
                      <span>Record COD Cash Collection</span>
                    )}
                  </button>
                </div>
              ) : (
                <div className="banner-alert banner-info">
                  <strong>Security Policy:</strong> Online gateway payments (Razorpay, Stripe, UPI) require webhook confirmation from the trusted payment provider. Manual fabrication of gateway transaction IDs is strictly forbidden.
                </div>
              )}
            </div>
          )}

          {/* Admin Test Order Cleanup Section */}
          {order.isTestOrder && (
            <div
              style={{
                marginTop: 24,
                padding: 16,
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f87171', fontWeight: 600, fontSize: 13 }}>
                  <TrashIcon style={{ width: 16, height: 16 }} />
                  <span>Admin Test Order Cleanup</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, maxWidth: 440 }}>
                  This document is verified as an internal test order (<code style={{ color: '#fbbf24' }}>isTestOrder === true</code>). You can permanently remove it from Cloud Firestore once testing is complete. Ordinary customer orders can never be deleted.
                </p>
              </div>

              {!confirmingDeleteTest ? (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    borderColor: 'rgba(239, 68, 68, 0.5)',
                    color: '#f87171',
                    fontSize: 12,
                    padding: '6px 14px',
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  onClick={() => setConfirmingDeleteTest(true)}
                  disabled={isUpdating || isDeletingTest}
                >
                  <TrashIcon style={{ width: 14, height: 14 }} />
                  <span>Delete Test Order...</span>
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    style={{
                      background: '#dc2626',
                      color: '#fff',
                      border: 'none',
                      fontSize: 12,
                      padding: '6px 14px',
                      height: 36,
                      borderRadius: 8,
                      cursor: isDeletingTest ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 600,
                    }}
                    disabled={isDeletingTest}
                    onClick={handleDeleteTestOrder}
                  >
                    {isDeletingTest ? (
                      <>
                        <SpinnerIcon style={{ width: 14, height: 14 }} />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <span>Confirm Permanent Deletion</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '6px 12px', height: 36 }}
                    disabled={isDeletingTest}
                    onClick={() => setConfirmingDeleteTest(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
