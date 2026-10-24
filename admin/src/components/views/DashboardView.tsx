import { useState, useEffect, useCallback } from 'react';
import {
  fetchProducts,
  formatINR,
  getStockStatus,
  type Product,
} from '../../services/productService';
import {
  fetchOrders,
  type Order,
  type OrderFulfillmentStatus,
} from '../../services/orderService';
import type { NavViewKey } from '../layout/DashboardLayout';
import {
  ProductsIcon,
  OrdersIcon,
  UsersIcon,
  RupeeIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  RefreshIcon,
  SpinnerIcon,
  EyeIcon,
  TrendingUpIcon,
} from '../common/Icons';

export interface DashboardViewProps {
  onNavigate?: (view: NavViewKey) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Parallel fetch of live Firestore products and orders
      const [fetchedProducts, fetchedOrders] = await Promise.all([
        fetchProducts(),
        fetchOrders(),
      ]);

      setProducts(fetchedProducts);
      setOrders(fetchedOrders);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to load live data from Cloud Firestore.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ==========================================
  // METRICS CALCULATIONS
  // ==========================================

  // 1. Total Products
  const totalProducts = products.length;
  const demoProductsCount = products.filter(
    (p) => p.isDemo || p.id.startsWith('demo-prod-')
  ).length;
  const realProductsCount = totalProducts - demoProductsCount;

  // 2. Total Orders
  const totalOrders = orders.length;

  // 3. Total Customers (Unique non-empty customer UIDs from historical orders)
  const uniqueCustomerUids = new Set<string>();
  for (const order of orders) {
    const uid = order.customer?.uid?.trim();
    if (uid) {
      uniqueCustomerUids.add(uid);
    }
  }
  const totalCustomers = uniqueCustomerUids.size;

  // 4. Pending Orders (Orders requiring further fulfillment actions)
  const pendingOrders = orders.filter(
    (o) =>
      o.fulfillment?.status !== 'installed' &&
      o.fulfillment?.status !== 'cancelled'
  );
  const pendingOrdersCount = pendingOrders.length;

  // 5. Total Revenue (Sum verified Razorpay payments and confirmed collected COD payments only)
  let totalRevenue = 0;
  let verifiedPaymentCount = 0;

  for (const order of orders) {
    // Exclude cancelled orders entirely
    if (order.fulfillment?.status === 'cancelled') {
      continue;
    }

    const payment = order.payment;
    if (!payment) continue;

    // Exclude pending, failed, or refunded payments
    if (payment.status === 'failed' || payment.status === 'pending' || payment.status === 'refunded') {
      continue;
    }

    // Cash on Delivery: Must be verified collected by technician or status explicitly marked 'paid'
    if (payment.method === 'cash_on_delivery') {
      if (payment.status === 'paid' || payment.collectedByTechnician === true) {
        const amount =
          typeof payment.collectedAmount === 'number' && payment.collectedAmount > 0
            ? payment.collectedAmount
            : Number(order.pricing?.totalAmount) || 0;
        totalRevenue += amount;
        verifiedPaymentCount++;
      }
    }
    // Online / Razorpay / Net Banking / UPI
    else {
      if (payment.status === 'paid') {
        const amount = Number(order.pricing?.totalAmount) || 0;
        totalRevenue += amount;
        verifiedPaymentCount++;
      }
    }
  }

  // 6. Low Stock Products (Stock <= 5 or invalid, consistent with InventoryView)
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let invalidStockCount = 0;
  const lowStockItems: Product[] = [];

  for (const p of products) {
    const status = getStockStatus(p.stock);
    if (status === 'invalid') {
      invalidStockCount++;
      lowStockItems.push(p);
    } else if (status === 'out_of_stock') {
      outOfStockCount++;
      lowStockCount++;
      lowStockItems.push(p);
    } else if (status === 'low_stock') {
      lowStockCount++;
      lowStockItems.push(p);
    }
  }

  // ==========================================
  // FULFILLMENT DISTRIBUTION
  // ==========================================
  const fulfillmentBreakdown: Record<
    OrderFulfillmentStatus,
    { label: string; count: number; color: string }
  > = {
    pending: { label: 'Pending', count: 0, color: 'var(--amber-primary)' },
    processing: { label: 'Processing', count: 0, color: 'var(--blue-primary)' },
    dispatched: { label: 'Dispatched', count: 0, color: 'var(--cyan-primary)' },
    out_for_installation: {
      label: 'Out for Installation',
      count: 0,
      color: 'var(--teal-primary)',
    },
    installed: {
      label: 'Installed & Verified',
      count: 0,
      color: 'var(--emerald-primary)',
    },
    cancelled: { label: 'Cancelled', count: 0, color: 'var(--rose-primary)' },
  };

  for (const o of orders) {
    const status = o.fulfillment?.status || 'pending';
    if (fulfillmentBreakdown[status]) {
      fulfillmentBreakdown[status].count++;
    }
  }

  // 5 Latest Orders
  const recentOrders = orders.slice(0, 5);

  // Helper: Format Order Date
  function formatOrderDate(dateVal: any): string {
    if (!dateVal) return 'N/A';
    try {
      let d: Date;
      if (typeof dateVal.toDate === 'function') {
        d = dateVal.toDate();
      } else if (dateVal instanceof Date) {
        d = dateVal;
      } else if (typeof dateVal.seconds === 'number') {
        d = new Date(dateVal.seconds * 1000);
      } else {
        d = new Date(dateVal);
      }
      if (isNaN(d.getTime())) return 'N/A';
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  }

  // Helper: Format Line Items Summary
  function getOrderItemsSummary(order: Order): { count: number; description: string } {
    if (!Array.isArray(order.items) || order.items.length === 0) {
      return { count: 0, description: 'No items' };
    }
    const totalUnits = order.items.reduce(
      (sum, it) => sum + (Number(it.quantity) || 1),
      0
    );
    const firstItemName = order.items[0]?.name || 'Water Purifier';
    const moreText = order.items.length > 1 ? ` +${order.items.length - 1} more` : '';
    return {
      count: totalUnits,
      description: `${firstItemName}${moreText}`,
    };
  }

  // Helper: Payment Status Badge
  function getPaymentBadge(order: Order): { label: string; className: string } {
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
        return { label: 'Paid', className: 'status-success' };
      case 'failed':
        return { label: 'Failed', className: 'status-danger' };
      case 'refunded':
        return { label: 'Refunded', className: 'status-info' };
      case 'pending':
      default:
        return { label: 'Pending', className: 'status-warning' };
    }
  }

  // Helper: Fulfillment Status Badge
  function getFulfillmentBadge(status?: OrderFulfillmentStatus): {
    label: string;
    className: string;
  } {
    switch (status) {
      case 'installed':
        return { label: 'Installed', className: 'status-success' };
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
        return { label: 'Pending', className: 'status-warning' };
    }
  }

  // Metric Cards Definition
  const metricCards = [
    {
      title: 'Total Products',
      value: totalProducts.toLocaleString('en-IN'),
      subtext: `${realProductsCount} catalog / ${demoProductsCount} demo items`,
      icon: <ProductsIcon style={{ width: 20, height: 20 }} />,
      color: 'var(--cyan-primary)',
      onClick: () => onNavigate?.('products'),
    },
    {
      title: 'Total Orders',
      value: totalOrders.toLocaleString('en-IN'),
      subtext: totalOrders > 0 ? `${verifiedPaymentCount} settled / ${pendingOrdersCount} open` : 'No orders recorded yet',
      icon: <OrdersIcon style={{ width: 20, height: 20 }} />,
      color: 'var(--blue-primary)',
      onClick: () => onNavigate?.('orders'),
    },
    {
      title: 'Total Customers',
      value: totalCustomers.toLocaleString('en-IN'),
      subtext: 'Unique buyers with order records',
      icon: <UsersIcon style={{ width: 20, height: 20 }} />,
      color: 'var(--teal-primary)',
      onClick: () => onNavigate?.('customers'),
    },
    {
      title: 'Pending Orders',
      value: pendingOrdersCount.toLocaleString('en-IN'),
      subtext:
        pendingOrdersCount > 0
          ? `${pendingOrdersCount} requiring fulfillment action`
          : 'All orders fulfilled & verified',
      icon: <CheckCircleIcon style={{ width: 20, height: 20 }} />,
      color: pendingOrdersCount > 0 ? 'var(--amber-primary)' : 'var(--emerald-primary)',
      onClick: () => onNavigate?.('orders'),
    },
    {
      title: 'Verified Revenue',
      value: formatINR(totalRevenue),
      subtext:
        verifiedPaymentCount > 0
          ? `Settled via Razorpay & collected COD (${verifiedPaymentCount} orders)`
          : 'Awaiting first verified payment',
      icon: <RupeeIcon style={{ width: 20, height: 20 }} />,
      color: 'var(--emerald-primary)',
    },
    {
      title: 'Low Stock Items',
      value: lowStockCount.toLocaleString('en-IN'),
      subtext:
        invalidStockCount > 0
          ? `${outOfStockCount} out of stock • ${invalidStockCount} invalid`
          : lowStockCount > 0
            ? `${outOfStockCount} out of stock (≤ 5 units remaining)`
            : 'All catalog stock healthy (> 5 units)',
      icon: <AlertTriangleIcon style={{ width: 20, height: 20 }} />,
      color: lowStockCount > 0 || invalidStockCount > 0 ? 'var(--rose-primary)' : 'var(--text-muted)',
      onClick: () => onNavigate?.('inventory'),
    },
  ];

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
              Operations Overview
            </h1>
            <span className="status-badge status-success" style={{ fontSize: 11 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--emerald-primary)',
                  display: 'inline-block',
                }}
              />
              Live Telemetry
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Real-time Cloud Firestore metrics across orders, catalog inventory, and fulfillment.
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
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            style={{ height: 38, fontSize: 13 }}
            title="Refresh dashboard metrics from Cloud Firestore"
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
            onClick={() => loadData(true)}
            style={{ height: 32, padding: '0 12px', fontSize: 12, borderColor: 'rgba(244, 63, 94, 0.4)' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* 6 Metric Cards Grid */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {loading
          ? Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div className="skeleton-box" style={{ width: 110, height: 14 }} />
                  <div className="skeleton-box" style={{ width: 40, height: 40, borderRadius: 10 }} />
                </div>
                <div className="skeleton-box" style={{ width: 140, height: 32, marginBottom: 10 }} />
                <div className="skeleton-box" style={{ width: 180, height: 12 }} />
              </div>
            ))
          : metricCards.map((card, idx) => (
              <div
                key={idx}
                className="stat-card"
                onClick={card.onClick}
                style={{
                  cursor: card.onClick ? 'pointer' : 'default',
                  transition: 'transform 0.2s, border-color 0.2s',
                }}
              >
                <div className="stat-card-header">
                  <span className="stat-label">{card.title}</span>
                  <div
                    className="stat-icon-wrapper"
                    style={{
                      color: card.color,
                      background: `${card.color}15`,
                    }}
                  >
                    {card.icon}
                  </div>
                </div>
                <div className="stat-value">{card.value}</div>
                <div className="stat-subtext">{card.subtext}</div>
              </div>
            ))}
      </div>

      {/* Fulfillment Status Distribution Panel */}
      <div className="section-panel" style={{ marginBottom: 0 }}>
        <div className="section-panel-header">
          <div>
            <h2 className="section-panel-title">Order Fulfillment Distribution</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Breakdown of {totalOrders} recorded order{totalOrders === 1 ? '' : 's'} across technical dispatch and installation stages.
            </p>
          </div>
          <span className="status-badge status-info">
            <TrendingUpIcon style={{ width: 13, height: 13 }} />
            {pendingOrdersCount} Active In-Flight
          </span>
        </div>

        {loading ? (
          <div>
            <div className="skeleton-box" style={{ width: '100%', height: 16, borderRadius: 999, marginBottom: 16 }} />
            <div className="distribution-legend">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-box" style={{ height: 36, borderRadius: 8 }} />
              ))}
            </div>
          </div>
        ) : totalOrders === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            <OrdersIcon style={{ width: 36, height: 36, margin: '0 auto 12px auto', opacity: 0.4 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
              No orders recorded yet.
            </p>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              Orders created via mobile checkout or the test generator will automatically populate this distribution.
            </p>
          </div>
        ) : (
          <div>
            {/* Accessible Segmented Bar */}
            <div
              className="distribution-bar"
              role="progressbar"
              aria-label="Order fulfillment status distribution"
            >
              {Object.entries(fulfillmentBreakdown).map(([statusKey, info]) => {
                if (info.count === 0) return null;
                const percentage = Math.max(1, (info.count / totalOrders) * 100);
                return (
                  <div
                    key={statusKey}
                    className="distribution-segment"
                    style={{
                      width: `${percentage}%`,
                      background: info.color,
                    }}
                    title={`${info.label}: ${info.count} (${percentage.toFixed(1)}%)`}
                  />
                );
              })}
            </div>

            {/* Interactive Legend Grid */}
            <div className="distribution-legend">
              {Object.entries(fulfillmentBreakdown).map(([statusKey, info]) => {
                const percentage =
                  totalOrders > 0 ? ((info.count / totalOrders) * 100).toFixed(0) : '0';
                return (
                  <div key={statusKey} className="distribution-legend-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="distribution-dot" style={{ background: info.color }} />
                      <span style={{ fontWeight: 500 }}>{info.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{info.count}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        ({percentage}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Grid: Recent Orders & Inventory Alerts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: lowStockItems.length > 0 ? 'minmax(0, 1.8fr) minmax(0, 1.2fr)' : '1fr',
          gap: 24,
        }}
      >
        {/* Recent Orders Panel */}
        <div className="section-panel" style={{ marginBottom: 0 }}>
          <div className="section-panel-header">
            <div>
              <h2 className="section-panel-title">Recent Actual Orders</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Five most recent live orders from Cloud Firestore.
              </p>
            </div>
            {onNavigate && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onNavigate('orders')}
                style={{ height: 32, fontSize: 12, padding: '0 12px' }}
              >
                <span>View All Orders</span>
                <EyeIcon style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="skeleton-box" style={{ width: '100%', height: 48, borderRadius: 8 }} />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
              <OrdersIcon style={{ width: 40, height: 40, margin: '0 auto 12px auto', opacity: 0.3 }} />
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
                No customer orders in Firestore yet.
              </p>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                Switch to the <strong>Orders</strong> tab to generate a realistic test order or checkout from the mobile app.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Fulfillment</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => {
                    const paymentBadge = getPaymentBadge(order);
                    const fulfillmentBadge = getFulfillmentBadge(order.fulfillment?.status);
                    const itemsSummary = getOrderItemsSummary(order);
                    const customerName =
                      order.customer?.name || order.customer?.email || 'Valued Customer';
                    const city = order.shippingAddress?.city;

                    return (
                      <tr key={order.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cyan-primary)' }}>
                          {order.orderNumber || order.id.slice(0, 8)}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{customerName}</div>
                          {city && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {city}
                              {order.shippingAddress?.state ? `, ${order.shippingAddress.state}` : ''}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>
                            {itemsSummary.count} unit{itemsSummary.count === 1 ? '' : 's'}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--text-muted)',
                              maxWidth: 180,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={itemsSummary.description}
                          >
                            {itemsSummary.description}
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {formatOrderDate(order.createdAt)}
                        </td>
                        <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {formatINR(order.pricing?.totalAmount || 0)}
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Low-Stock Inventory Alerts Panel (Visible if low stock items exist) */}
        {lowStockItems.length > 0 && (
          <div className="section-panel" style={{ marginBottom: 0 }}>
            <div className="section-panel-header">
              <div>
                <h2 className="section-panel-title" style={{ color: '#fb7185' }}>
                  Low Stock Attention
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {lowStockItems.length} product{lowStockItems.length === 1 ? '' : 's'} with stock ≤ 5 units.
                </p>
              </div>
              <span className="status-badge status-danger">
                <AlertTriangleIcon style={{ width: 12, height: 12 }} />
                Restock Alert
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lowStockItems.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(244, 63, 94, 0.2)',
                    borderRadius: 10,
                  }}
                >
                  <div style={{ minWidth: 0, paddingRight: 10 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatINR(item.price)} • {item.category}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span
                      className={`status-badge ${
                        getStockStatus(item.stock) === 'out_of_stock'
                          ? 'status-danger'
                          : getStockStatus(item.stock) === 'invalid'
                            ? 'status-danger'
                            : 'status-warning'
                      }`}
                    >
                      {getStockStatus(item.stock) === 'invalid'
                        ? 'Invalid Stock'
                        : item.stock === 0
                          ? 'Out of Stock'
                          : `${item.stock} left`}
                    </span>
                  </div>
                </div>
              ))}

              {lowStockItems.length > 5 && (
                <div style={{ textAlign: 'center', marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onNavigate?.('inventory')}
                    style={{ width: '100%', height: 32, fontSize: 12 }}
                  >
                    View All {lowStockItems.length} Low-Stock Products
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
