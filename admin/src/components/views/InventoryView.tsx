import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToProducts,
  restartProductsSubscription,
  updateProductStock,
  formatINR,
  getStockStatus,
  type Product,
  type ProductCategory,
  type StockStatus,
} from '../../services/productService';
import { StockAdjustModal } from './StockAdjustModal';
import {
  InventoryIcon,
  SearchIcon,
  RefreshIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ProductsIcon,
  CopyIcon,
  EditIcon,
} from '../common/Icons';

export function InventoryView() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StockStatus | 'all'>('all');
  const [demoFilter, setDemoFilter] = useState<'all' | 'real' | 'demo'>('all');

  // Stock Adjustment Modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [retryTrigger, setRetryTrigger] = useState(0);

  const handleManualRefresh = useCallback(() => {
    setRefreshing(true);
    setError(null);
    restartProductsSubscription();
    setRetryTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsub = subscribeToProducts(
      (data) => {
        setProducts(data);
        setLoading(false);
        setRefreshing(false);
        setLastUpdated(new Date());
      },
      (err) => {
        setError(err.message || 'Failed to sync products from Cloud Firestore.');
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => {
      unsub();
    };
  }, [retryTrigger]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenAdjust = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseAdjust = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  const handleStockUpdate = async (productId: string, newStock: number) => {
    if (!user?.uid) {
      throw new Error('Administrator session not found. Please re-authenticate.');
    }

    await updateProductStock(productId, newStock, user.uid);
    showSuccess(`Inventory updated: stock set to ${newStock} unit(s).`);

    // Optimistically update local state & reload
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, stock: newStock } : p))
    );
  };

  // Inventory Metrics
  const metrics = useMemo(() => {
    const totalProducts = products.length;
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let invalidStock = 0;

    for (const p of products) {
      const status = getStockStatus(p.stock);
      switch (status) {
        case 'in_stock':
          inStock++;
          break;
        case 'low_stock':
          lowStock++;
          break;
        case 'out_of_stock':
          outOfStock++;
          break;
        case 'invalid':
        default:
          invalidStock++;
          break;
      }
    }

    return {
      totalProducts,
      inStock,
      lowStock,
      outOfStock,
      invalidStock,
    };
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // 1. Search Query (Name, ID/SKU, Category)
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesId = p.id.toLowerCase().includes(query);
        const matchesCategory = p.category.toLowerCase().includes(query);
        if (!matchesName && !matchesId && !matchesCategory) {
          return false;
        }
      }

      // 2. Category Filter
      if (categoryFilter !== 'all' && p.category !== categoryFilter) {
        return false;
      }

      // 3. Stock Status Filter
      if (statusFilter !== 'all') {
        const status = getStockStatus(p.stock);
        if (status !== statusFilter) {
          return false;
        }
      }

      // 4. Demo Filter
      const isDemo = Boolean(p.isDemo || p.id.startsWith('demo-prod-'));
      if (demoFilter === 'real' && isDemo) return false;
      if (demoFilter === 'demo' && !isDemo) return false;

      return true;
    });
  }, [products, searchTerm, categoryFilter, statusFilter, demoFilter]);

  const renderStockBadge = (stock: any) => {
    const status = getStockStatus(stock);
    switch (status) {
      case 'in_stock':
        return <span className="status-badge status-success">In Stock (&gt; 5)</span>;
      case 'low_stock':
        return (
          <span className="status-badge status-warning">
            <AlertTriangleIcon style={{ width: 12, height: 12 }} />
            Low Stock (1–5)
          </span>
        );
      case 'out_of_stock':
        return (
          <span className="status-badge status-danger">
            Out of Stock (0)
          </span>
        );
      case 'invalid':
      default:
        return (
          <span className="status-badge status-danger" title="Invalid, missing, or negative stock">
            <AlertTriangleIcon style={{ width: 12, height: 12 }} />
            Invalid / Unknown
          </span>
        );
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header Bar */}
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
              Inventory & Stock Management
            </h1>
            <span className="live-badge" title="Live streaming real-time inventory from Cloud Firestore">
              <span className="live-dot" />
              LIVE SYNC
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Monitor real-time purifier & cartridge stock quantities in Cloud Firestore and safely adjust inventory levels.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Live as of {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={handleManualRefresh}
            disabled={loading || refreshing}
            style={{ height: 38, fontSize: 13 }}
            title="Re-sync product stock from Cloud Firestore"
          >
            {refreshing ? (
              <>
                <SpinnerIcon style={{ width: 15, height: 15 }} />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <RefreshIcon style={{ width: 15, height: 15 }} />
                <span>Re-sync</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div
          className="animate-fade-in"
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#34d399',
            padding: '14px 20px',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
          }}
        >
          <CheckCircleIcon style={{ width: 18, height: 18, flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

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
            onClick={handleManualRefresh}
            style={{ height: 32, padding: '0 12px', fontSize: 12, borderColor: 'rgba(244, 63, 94, 0.4)' }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
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
            {/* Total Products */}
            <div
              className="stat-card"
              onClick={() => {
                setStatusFilter('all');
                setCategoryFilter('all');
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className="stat-card-header">
                <span className="stat-label">Total SKUs Tracked</span>
                <div className="stat-icon-wrapper" style={{ color: 'var(--cyan-primary)', background: 'rgba(6, 182, 212, 0.1)' }}>
                  <ProductsIcon style={{ width: 18, height: 18 }} />
                </div>
              </div>
              <div className="stat-value">{metrics.totalProducts}</div>
              <div className="stat-subtext">All catalog purifiers & parts</div>
            </div>

            {/* In Stock */}
            <div
              className="stat-card"
              onClick={() => setStatusFilter('in_stock')}
              style={{ cursor: 'pointer' }}
            >
              <div className="stat-card-header">
                <span className="stat-label">Healthy Stock (&gt; 5)</span>
                <div className="stat-icon-wrapper" style={{ color: 'var(--emerald-primary)', background: 'rgba(16, 185, 129, 0.1)' }}>
                  <CheckCircleIcon style={{ width: 18, height: 18 }} />
                </div>
              </div>
              <div className="stat-value">{metrics.inStock}</div>
              <div className="stat-subtext">Sufficient warehouse buffer</div>
            </div>

            {/* Low Stock (1-5 units) */}
            <div
              className="stat-card"
              onClick={() => setStatusFilter('low_stock')}
              style={{
                cursor: 'pointer',
                borderColor: metrics.lowStock > 0 ? 'rgba(245, 158, 11, 0.3)' : undefined,
              }}
            >
              <div className="stat-card-header">
                <span className="stat-label">Low Stock (1–5 Units)</span>
                <div className="stat-icon-wrapper" style={{ color: 'var(--amber-primary)', background: 'rgba(245, 158, 11, 0.1)' }}>
                  <AlertTriangleIcon style={{ width: 18, height: 18 }} />
                </div>
              </div>
              <div className="stat-value" style={{ color: metrics.lowStock > 0 ? '#fbbf24' : '#fff' }}>
                {metrics.lowStock}
              </div>
              <div className="stat-subtext">Restock orders recommended</div>
            </div>

            {/* Out of Stock (0 units) */}
            <div
              className="stat-card"
              onClick={() => setStatusFilter('out_of_stock')}
              style={{
                cursor: 'pointer',
                borderColor: metrics.outOfStock > 0 ? 'rgba(244, 63, 94, 0.3)' : undefined,
              }}
            >
              <div className="stat-card-header">
                <span className="stat-label">Out of Stock (0 Units)</span>
                <div className="stat-icon-wrapper" style={{ color: 'var(--rose-primary)', background: 'rgba(244, 63, 94, 0.1)' }}>
                  <AlertTriangleIcon style={{ width: 18, height: 18 }} />
                </div>
              </div>
              <div className="stat-value" style={{ color: metrics.outOfStock > 0 ? '#fb7185' : '#fff' }}>
                {metrics.outOfStock}
              </div>
              <div className="stat-subtext">Ordering automatically blocked</div>
            </div>

            {/* Invalid Stock (Visible for correction if any exist) */}
            {metrics.invalidStock > 0 && (
              <div
                className="stat-card"
                onClick={() => setStatusFilter('invalid')}
                style={{
                  cursor: 'pointer',
                  borderColor: 'rgba(244, 63, 94, 0.5)',
                  background: 'rgba(244, 63, 94, 0.08)',
                }}
              >
                <div className="stat-card-header">
                  <span className="stat-label" style={{ color: '#fb7185' }}>Invalid Stock Quantity</span>
                  <div className="stat-icon-wrapper" style={{ color: '#fb7185', background: 'rgba(244, 63, 94, 0.2)' }}>
                    <AlertTriangleIcon style={{ width: 18, height: 18 }} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: '#fb7185' }}>
                  {metrics.invalidStock}
                </div>
                <div className="stat-subtext" style={{ color: '#fb7185' }}>
                  Missing/negative values require correction
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Main Section Panel: Filters & Inventory Table */}
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
          {/* Search Box */}
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
              placeholder="Search by product name, SKU / ID, category..."
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

          {/* Filter Selects */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Stock Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="form-input"
              style={{ height: 42, width: 'auto', padding: '0 12px' }}
            >
              <option value="all">All Stock Statuses</option>
              <option value="in_stock">In Stock (&gt; 5)</option>
              <option value="low_stock">Low Stock (1–5)</option>
              <option value="out_of_stock">Out of Stock (0)</option>
              <option value="invalid">Invalid / Needs Attention</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="form-input"
              style={{ height: 42, width: 'auto', padding: '0 12px' }}
            >
              <option value="all">All Categories</option>
              <option value="ro-purifiers">RO Purifiers</option>
              <option value="uv-uf-purifiers">UV + UF Purifiers</option>
              <option value="cartridges">Filter Cartridges</option>
              <option value="spare-parts">Spare Parts</option>
            </select>

            {/* Demo Filter */}
            <select
              value={demoFilter}
              onChange={(e) => setDemoFilter(e.target.value as any)}
              className="form-input"
              style={{ height: 42, width: 'auto', padding: '0 12px' }}
            >
              <option value="all">Real & Demo SKUs</option>
              <option value="real">Real Products Only</option>
              <option value="demo">Demo Catalog Only</option>
            </select>
          </div>
        </div>

        {/* Inventory Data Table */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="skeleton-box" style={{ width: '100%', height: 54, borderRadius: 8 }} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
            <InventoryIcon style={{ width: 44, height: 44, margin: '0 auto 12px auto', opacity: 0.3 }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
              No inventory records match your criteria.
            </p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearchTerm('');
                setCategoryFilter('all');
                setStatusFilter('all');
                setDemoFilter('all');
              }}
              style={{ marginTop: 14 }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU / Product ID</th>
                  <th>Category</th>
                  <th>Unit Price</th>
                  <th>Current Stock</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const status = getStockStatus(p.stock);
                  const isInvalid = status === 'invalid';
                  const isOutOfStock = status === 'out_of_stock';
                  const isLow = status === 'low_stock';

                  return (
                    <tr
                      key={p.id}
                      style={{
                        background: isInvalid
                          ? 'rgba(244, 63, 94, 0.04)'
                          : isOutOfStock
                          ? 'rgba(244, 63, 94, 0.02)'
                          : undefined,
                      }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 8,
                                objectFit: 'cover',
                                background: 'rgba(0, 0, 0, 0.4)',
                                border: '1px solid var(--border-subtle)',
                              }}
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 8,
                                background: 'rgba(0, 0, 0, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--cyan-primary)',
                              }}
                            >
                              <ProductsIcon style={{ width: 18, height: 18 }} />
                            </div>
                          )}

                          <div>
                            <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>
                              {p.name}
                            </div>
                            {p.badge && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: 'var(--cyan-primary)',
                                  background: 'rgba(6, 182, 212, 0.1)',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  marginTop: 2,
                                  display: 'inline-block',
                                }}
                              >
                                {p.badge}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <span>{p.id}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyId(p.id, e)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: copiedId === p.id ? '#34d399' : 'var(--text-muted)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              padding: 0,
                            }}
                            title="Copy SKU/ID"
                          >
                            {copiedId === p.id ? (
                              <CheckCircleIcon style={{ width: 12, height: 12 }} />
                            ) : (
                              <CopyIcon style={{ width: 12, height: 12 }} />
                            )}
                          </button>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                          {p.category.replace(/-/g, ' ')}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {formatINR(p.price)}
                        </div>
                      </td>

                      <td>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 15,
                            fontWeight: 700,
                            color: isInvalid
                              ? '#fb7185'
                              : isOutOfStock
                              ? '#fb7185'
                              : isLow
                              ? '#fbbf24'
                              : '#34d399',
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: isInvalid
                                ? '#fb7185'
                                : isOutOfStock
                                ? '#fb7185'
                                : isLow
                                ? '#fbbf24'
                                : '#34d399',
                              flexShrink: 0,
                            }}
                          />
                          <span>
                            {isInvalid ? 'Invalid' : `${p.stock} unit${p.stock === 1 ? '' : 's'}`}
                          </span>
                        </div>
                      </td>

                      <td>{renderStockBadge(p.stock)}</td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleOpenAdjust(p)}
                          style={{
                            height: 32,
                            fontSize: 12,
                            padding: '0 12px',
                            borderColor: isInvalid ? 'rgba(244, 63, 94, 0.4)' : undefined,
                          }}
                          title="Adjust physical stock quantity"
                        >
                          <EditIcon style={{ width: 13, height: 13 }} />
                          <span>Adjust Stock</span>
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

      {/* Stock Adjustment Modal */}
      <StockAdjustModal
        isOpen={isModalOpen}
        onClose={handleCloseAdjust}
        product={selectedProduct}
        onUpdateStock={handleStockUpdate}
      />
    </div>
  );
}
