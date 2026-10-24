import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToProducts,
  restartProductsSubscription,
  createProduct,
  updateProduct,
  removeProduct,
  seed50DemoProducts,
  cleanupDemoProducts,
  formatINR,
  type Product,
  type ProductInput,
  type ProductCategory,
} from '../../services/productService';
import { ProductModal } from './ProductModal';
import {
  ProductsIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  SearchIcon,
  RefreshIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  WaterDropIcon,
} from '../common/Icons';

export function ProductsView() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [demoFilter, setDemoFilter] = useState<'all' | 'real' | 'demo'>('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Delete confirmation state
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Demo Seeding & Cleanup states
  const [isSeedingModalOpen, setIsSeedingModalOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const handleManualRefresh = useCallback(() => {
    setLoading(true);
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
        setLastUpdated(new Date());
      },
      (err) => {
        setError(err.message || 'Failed to sync products from Cloud Firestore.');
        setLoading(false);
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

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (data: ProductInput) => {
    const adminUid = user?.uid || 'system_admin';
    if (editingProduct) {
      await updateProduct(editingProduct.id, data, adminUid);
      showSuccess(`"${data.name}" updated successfully.`);
    } else {
      await createProduct(data, adminUid);
      showSuccess(`"${data.name}" added to catalog.`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setIsDeleting(true);
    try {
      await removeProduct(deletingProduct.id);
      showSuccess(`"${deletingProduct.name}" removed from catalog.`);
      setDeletingProduct(null);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to delete product.';
      setError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmSeed = async () => {
    setIsSeeding(true);
    try {
      const adminUid = user?.uid || 'admin_seed';
      const result = await seed50DemoProducts(adminUid);
      showSuccess(result.message);
      setIsSeedingModalOpen(false);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to seed demo products.';
      setError(msg);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleConfirmCleanup = async () => {
    setIsCleaning(true);
    try {
      const result = await cleanupDemoProducts();
      showSuccess(result.message);
      setIsCleanupModalOpen(false);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to remove demo products.';
      setError(msg);
    } finally {
      setIsCleaning(false);
    }
  };

  // Demo inventory breakdown
  const demoProductsCount = products.filter(
    (p) => p.isDemo === true || p.id.startsWith('demo-prod-')
  ).length;
  const realProductsCount = products.length - demoProductsCount;

  // Filtered products list
  const filteredProducts = products.filter((p) => {
    const isDemo = p.isDemo === true || p.id.startsWith('demo-prod-');
    if (demoFilter === 'real' && isDemo) return false;
    if (demoFilter === 'demo' && !isDemo) return false;

    const matchesCategory =
      selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getStockBadge = (stock: number) => {
    if (stock <= 0) {
      return <span className="status-badge status-danger">Out of Stock</span>;
    }
    if (stock <= 10) {
      return <span className="status-badge status-warning">Low Stock ({stock})</span>;
    }
    return <span className="status-badge status-success">In Stock ({stock})</span>;
  };

  const getCategoryLabel = (cat: ProductCategory) => {
    switch (cat) {
      case 'ro-purifiers':
        return 'Smart RO';
      case 'uv-uf-purifiers':
        return 'UV + UF';
      case 'cartridges':
        return 'Filter / Cartridge';
      case 'spare-parts':
        return 'Spare Part';
      default:
        return cat;
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
              onClick={handleManualRefresh}
              className="btn-secondary"
              style={{ marginTop: 8, height: 28, padding: '0 10px', fontSize: 11 }}
            >
              <RefreshIcon style={{ width: 12, height: 12 }} />
              <span>Retry Connection</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Panel */}
      <div className="section-panel">
        {/* Panel Header */}
        <div
          className="section-panel-header"
          style={{ flexWrap: 'wrap', gap: 16, alignItems: 'center' }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="section-panel-title">Water Purifier & Cartridge Catalog</h2>
              <span className="live-badge" title="Live streaming products from Cloud Firestore">
                <span className="live-dot" />
                LIVE SYNC
              </span>
              {demoProductsCount > 0 ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'rgba(56, 189, 248, 0.15)',
                    color: '#38bdf8',
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                  }}
                >
                  {demoProductsCount} DEMO PRODUCTS ACTIVE
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(148, 163, 184, 0.15)',
                    color: '#94a3b8',
                    padding: '3px 8px',
                    borderRadius: 6,
                  }}
                >
                  REAL INVENTORY ONLY
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Live inventory backed by Cloud Firestore <code>products</code> collection.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {lastUpdated && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Live as of {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}

            <button
              onClick={handleManualRefresh}
              className="btn-secondary"
              disabled={loading}
              title="Re-sync catalog from Firestore"
              aria-label="Re-sync catalog"
            >
              <RefreshIcon style={{ width: 14, height: 14 }} className={loading ? 'animate-spin' : ''} />
              <span>Re-sync</span>
            </button>

            {/* Seed 50 Demo Products Button (Requirement E) */}
            <button
              onClick={() => setIsSeedingModalOpen(true)}
              className="btn-secondary"
              style={{
                borderColor: 'rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.08)',
              }}
              title="Seed exactly 50 categorized demo products into Firestore"
            >
              <WaterDropIcon style={{ width: 14, height: 14 }} />
              <span>Seed 50 Demo Products</span>
            </button>

            {/* Clear Demo Products Button */}
            {demoProductsCount > 0 && (
              <button
                onClick={() => setIsCleanupModalOpen(true)}
                className="btn-secondary"
                style={{
                  borderColor: 'rgba(244, 63, 94, 0.3)',
                  color: '#fda4af',
                  background: 'rgba(244, 63, 94, 0.08)',
                }}
                title="Remove only demo products from Firestore"
              >
                <TrashIcon style={{ width: 14, height: 14 }} />
                <span>Clear Demo Data ({demoProductsCount})</span>
              </button>
            )}

            <button
              onClick={handleOpenAdd}
              className="btn-primary"
              style={{ width: 'auto', padding: '0 18px', height: 40 }}
            >
              <PlusIcon style={{ width: 16, height: 16 }} />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* Search Bar & Category Filters */}
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
          {/* Search Input & Demo Filter Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: '1 1 360px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '8px 14px',
                minWidth: 240,
                flex: '1 1 240px',
              }}
            >
              <SearchIcon style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search by name, spec, or SKU..."
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

            {/* Filter by Real vs Demo */}
            <div style={{ display: 'flex', gap: 4, background: 'rgba(15, 23, 42, 0.6)', padding: 3, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setDemoFilter('all')}
                style={{
                  background: demoFilter === 'all' ? 'var(--cyan-primary)' : 'transparent',
                  color: demoFilter === 'all' ? '#0f172a' : '#94a3b8',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                All ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setDemoFilter('real')}
                style={{
                  background: demoFilter === 'real' ? 'var(--cyan-primary)' : 'transparent',
                  color: demoFilter === 'real' ? '#0f172a' : '#94a3b8',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Real ({realProductsCount})
              </button>
              <button
                type="button"
                onClick={() => setDemoFilter('demo')}
                style={{
                  background: demoFilter === 'demo' ? '#38bdf8' : 'transparent',
                  color: demoFilter === 'demo' ? '#0f172a' : '#94a3b8',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Demo ({demoProductsCount})
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(
              [
                { key: 'all', label: 'All Categories' },
                { key: 'ro-purifiers', label: 'RO Purifiers' },
                { key: 'uv-uf-purifiers', label: 'UV + UF' },
                { key: 'cartridges', label: 'Cartridges' },
                { key: 'spare-parts', label: 'Spare Parts' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.key}
                className="btn-secondary"
                style={{
                  background: selectedCategory === cat.key ? 'var(--cyan-glow)' : undefined,
                  borderColor: selectedCategory === cat.key ? 'var(--cyan-primary)' : undefined,
                  color: selectedCategory === cat.key ? '#fff' : undefined,
                  fontSize: 12,
                  height: 36,
                }}
                onClick={() => setSelectedCategory(cat.key)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table & Dynamic States */}
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <SpinnerIcon style={{ width: 28, height: 28, color: 'var(--cyan-primary)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 500 }}>Loading catalog from Cloud Firestore...</div>
          </div>
        ) : filteredProducts.length === 0 ? (
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
              <WaterDropIcon style={{ width: 24, height: 24 }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 6 }}>
              {products.length === 0 ? 'No Products in Firestore Catalog' : 'No Matching Products'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto 20px' }}>
              {products.length === 0
                ? 'Your Cloud Firestore products collection is currently empty. Add your first water purifier model or replacement cartridge to get started.'
                : 'Try clearing your search query or switching category filters to see more results.'}
            </p>
            {products.length === 0 && (
              <button onClick={handleOpenAdd} className="btn-primary" style={{ width: 'auto', padding: '0 20px' }}>
                <PlusIcon style={{ width: 16, height: 16 }} />
                <span>Add First Product</span>
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price (INR)</th>
                  <th>Stock Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            onError={(e) => {
                              // Fallback on broken image link
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 8,
                              objectFit: 'cover',
                              background: '#1e293b',
                              border: '1px solid var(--border-subtle)',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 8,
                              background: '#1e293b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--cyan-primary)',
                              border: '1px solid var(--border-subtle)',
                              flexShrink: 0,
                            }}
                          >
                            <ProductsIcon style={{ width: 20, height: 20 }} />
                          </div>
                        )}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: '#fff' }}>{item.name}</span>
                            {(item.isDemo || item.id.startsWith('demo-prod-')) && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  background: 'rgba(56, 189, 248, 0.15)',
                                  color: '#38bdf8',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  letterSpacing: '0.5px',
                                }}
                              >
                                DEMO
                              </span>
                            )}
                            {item.imageType === 'ai-generated' && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  background: 'rgba(168, 85, 247, 0.15)',
                                  color: '#c084fc',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  border: '1px solid rgba(168, 85, 247, 0.3)',
                                }}
                              >
                                AI IMAGE
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                              marginTop: 2,
                              maxWidth: 380,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={item.description}
                          >
                            {item.description}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                            ID: {item.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="status-badge status-info">
                        {getCategoryLabel(item.category)}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--cyan-primary)', fontSize: 14 }}>
                      {formatINR(item.price)}
                    </td>
                    <td>{getStockBadge(item.stock)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="btn-secondary"
                          style={{ padding: '6px 10px', height: 32 }}
                          title="Edit product"
                          aria-label={`Edit ${item.name}`}
                        >
                          <EditIcon style={{ width: 14, height: 14 }} />
                        </button>
                        <button
                          onClick={() => setDeletingProduct(item)}
                          className="btn-secondary"
                          style={{
                            padding: '6px 10px',
                            height: 32,
                            borderColor: 'rgba(244, 63, 94, 0.4)',
                            color: '#fda4af',
                          }}
                          title="Delete product"
                          aria-label={`Delete ${item.name}`}
                        >
                          <TrashIcon style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      <ProductModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProduct(null);
        }}
        onSubmit={handleModalSubmit}
        initialProduct={editingProduct}
      />

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 110,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setDeletingProduct(null);
          }}
        >
          <div
            className="animate-fade-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 20,
              padding: 28,
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(244, 63, 94, 0.15)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(244, 63, 94, 0.15)',
                color: '#fb7185',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <TrashIcon style={{ width: 24, height: 24 }} />
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              Delete Product?
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 24 }}>
              Are you sure you want to delete <strong style={{ color: '#fff' }}>{deletingProduct.name}</strong> from Cloud Firestore? This action cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeletingProduct(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                  boxShadow: '0 4px 14px rgba(225, 29, 72, 0.35)',
                  width: 'auto',
                  padding: '0 20px',
                }}
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <SpinnerIcon style={{ width: 16, height: 16 }} />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Product</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seed 50 Demo Products Confirmation Modal (Requirement E) */}
      {isSeedingModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 110,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSeeding) setIsSeedingModalOpen(false);
          }}
        >
          <div
            className="animate-fade-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 20,
              padding: 28,
              maxWidth: 500,
              width: '100%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.15)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <WaterDropIcon style={{ width: 28, height: 28 }} />
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              Seed 50 Demo Products?
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              This will add exactly <strong style={{ color: '#fff' }}>50 uniquely categorized demo products</strong> to Cloud Firestore:
            </p>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                borderRadius: 10,
                padding: '12px 16px',
                textAlign: 'left',
                fontSize: 12,
                color: '#cbd5e1',
                marginBottom: 20,
                border: '1px solid var(--border-subtle)',
                lineHeight: 1.8,
              }}
            >
              <div>• <strong>12 Smart RO Purifiers</strong> (demo-prod-01 to 12)</div>
              <div>• <strong>12 UV + UF Disinfection Systems</strong> (demo-prod-13 to 24)</div>
              <div>• <strong>14 Cartridges, Membranes & Mineralizers</strong> (demo-prod-25 to 38)</div>
              <div>• <strong>12 Genuine Spare Parts & IoT Sensors</strong> (demo-prod-39 to 50)</div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#38bdf8' }}>
                ✓ Preserves real products &nbsp;•&nbsp; ✓ Idempotent batch write &nbsp;•&nbsp; ✓ Safe to remove later
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsSeedingModalOpen(false)}
                disabled={isSeeding}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                  width: 'auto',
                  padding: '0 22px',
                }}
                onClick={handleConfirmSeed}
                disabled={isSeeding}
              >
                {isSeeding ? (
                  <>
                    <SpinnerIcon style={{ width: 16, height: 16 }} />
                    <span>Writing Batches to Firestore...</span>
                  </>
                ) : (
                  <span>Confirm & Seed 50 Products</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Demo Products Confirmation Modal */}
      {isCleanupModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 110,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isCleaning) setIsCleanupModalOpen(false);
          }}
        >
          <div
            className="animate-fade-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              borderRadius: 20,
              padding: 28,
              maxWidth: 460,
              width: '100%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(244, 63, 94, 0.15)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(244, 63, 94, 0.15)',
                color: '#fb7185',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <TrashIcon style={{ width: 24, height: 24 }} />
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              Remove {demoProductsCount} Demo Products?
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
              This will safely delete only documents with ID <code style={{ color: '#38bdf8' }}>demo-prod-*</code> and <code style={{ color: '#38bdf8' }}>isDemo: true</code>.
              <br /><br />
              <strong style={{ color: '#34d399' }}>Real products and inventory are 100% protected and will not be touched.</strong>
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsCleanupModalOpen(false)}
                disabled={isCleaning}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                  boxShadow: '0 4px 14px rgba(225, 29, 72, 0.35)',
                  width: 'auto',
                  padding: '0 20px',
                }}
                onClick={handleConfirmCleanup}
                disabled={isCleaning}
              >
                {isCleaning ? (
                  <>
                    <SpinnerIcon style={{ width: 16, height: 16 }} />
                    <span>Removing Demo Records...</span>
                  </>
                ) : (
                  <span>Delete Only Demo Products</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
