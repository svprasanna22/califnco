import { useState, useEffect } from 'react';
import type { Product } from '../../services/productService';
import { getStockStatus, formatINR } from '../../services/productService';
import {
  CloseIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CopyIcon,
} from '../common/Icons';

interface StockAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onUpdateStock: (productId: string, newStock: number) => Promise<void>;
}

export function StockAdjustModal({
  isOpen,
  onClose,
  product,
  onUpdateStock,
}: StockAdjustModalProps) {
  const [stockInput, setStockInput] = useState<string>('');
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (product) {
      const current = typeof product.stock === 'number' && !isNaN(product.stock) ? product.stock : 0;
      setStockInput(String(Math.max(0, current)));
      setConfirmed(false);
      setError(null);
    }
  }, [product]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !product) return null;

  const currentStock = typeof product.stock === 'number' && !isNaN(product.stock) ? product.stock : null;
  const currentStatus = getStockStatus(product.stock);

  // Parse new stock value
  const parsedNewStock = Number(stockInput.trim());
  const isValidInteger =
    stockInput.trim() !== '' &&
    !isNaN(parsedNewStock) &&
    Number.isInteger(parsedNewStock) &&
    parsedNewStock >= 0;

  const newStatus = isValidInteger ? getStockStatus(parsedNewStock) : null;
  const stockDiff = isValidInteger && currentStock !== null ? parsedNewStock - currentStock : null;

  const handleCopyId = () => {
    navigator.clipboard.writeText(product.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleQuickSet = (val: number) => {
    setStockInput(String(Math.max(0, val)));
    setError(null);
  };

  const handleQuickAdd = (delta: number) => {
    const base = isValidInteger ? parsedNewStock : currentStock ?? 0;
    const next = Math.max(0, base + delta);
    setStockInput(String(next));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidInteger) {
      setError('Stock must be a valid, finite non-negative integer (0 or greater).');
      return;
    }
    if (!confirmed) {
      setError('Please check the confirmation box before saving inventory changes.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onUpdateStock(product.id, parsedNewStock);
      onClose();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to update stock quantity in Cloud Firestore.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: ReturnType<typeof getStockStatus>) => {
    switch (status) {
      case 'in_stock':
        return <span className="status-badge status-success">In Stock (&gt; 5)</span>;
      case 'low_stock':
        return <span className="status-badge status-warning">Low Stock (1–5)</span>;
      case 'out_of_stock':
        return <span className="status-badge status-danger">Out of Stock (0)</span>;
      case 'invalid':
      default:
        return <span className="status-badge status-danger">Invalid / Unknown</span>;
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
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-card)',
          borderRadius: 20,
          width: '100%',
          maxWidth: 540,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 30px rgba(6, 182, 212, 0.15)',
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
            background: 'rgba(0, 0, 0, 0.25)',
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
              Adjust Product Inventory
            </h2>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 4,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--cyan-primary)',
              }}
            >
              <span>SKU/ID: {product.id}</span>
              <button
                type="button"
                onClick={handleCopyId}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: copiedId ? '#34d399' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0,
                }}
                title="Copy Product ID"
              >
                {copiedId ? <CheckCircleIcon style={{ width: 12, height: 12 }} /> : <CopyIcon style={{ width: 12, height: 12 }} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-secondary"
            style={{ width: 34, height: 34, padding: 0, borderRadius: '50%' }}
            aria-label="Close modal"
          >
            <CloseIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Target Product Summary Box */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{product.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {formatINR(product.price)} • {product.category}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Current Status</div>
              {getStatusBadge(currentStatus)}
            </div>
          </div>

          {/* Current vs Proposed Stock Card */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Current In-Stock
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: currentStock === null ? '#fb7185' : '#fff', marginTop: 4 }}>
                {currentStock === null ? 'Invalid' : `${currentStock} units`}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Proposed Stock
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  marginTop: 4,
                  color: isValidInteger ? 'var(--cyan-primary)' : 'var(--text-muted)',
                }}
              >
                {isValidInteger ? `${parsedNewStock} units` : '—'}
                {stockDiff !== null && stockDiff !== 0 && (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      marginLeft: 8,
                      color: stockDiff > 0 ? '#34d399' : '#fb7185',
                    }}
                  >
                    ({stockDiff > 0 ? `+${stockDiff}` : stockDiff})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stock Input & Shortcuts */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
              New Physical Stock Quantity (Units)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={stockInput}
              onChange={(e) => {
                setStockInput(e.target.value);
                setError(null);
              }}
              className="form-input"
              placeholder="e.g. 25"
              style={{
                height: 46,
                fontSize: 16,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
              }}
              required
              disabled={isSubmitting}
            />

            {/* Quick Adjustment Shortcut Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleQuickSet(0)}
                style={{ height: 28, fontSize: 11, padding: '0 10px', borderColor: 'rgba(244, 63, 94, 0.3)' }}
              >
                Set to 0 (Out of Stock)
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleQuickAdd(5)}
                style={{ height: 28, fontSize: 11, padding: '0 10px' }}
              >
                +5 units
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleQuickAdd(10)}
                style={{ height: 28, fontSize: 11, padding: '0 10px' }}
              >
                +10 units
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleQuickAdd(25)}
                style={{ height: 28, fontSize: 11, padding: '0 10px' }}
              >
                +25 units
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleQuickAdd(50)}
                style={{ height: 28, fontSize: 11, padding: '0 10px' }}
              >
                +50 units
              </button>
            </div>
          </div>

          {/* Proposed Status Preview */}
          {isValidInteger && newStatus && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>Inventory Status After Update:</span>
              {getStatusBadge(newStatus)}
            </div>
          )}

          {/* Confirmation Checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
              padding: '12px 14px',
              background: confirmed ? 'rgba(6, 182, 212, 0.08)' : 'rgba(0, 0, 0, 0.2)',
              border: `1px solid ${confirmed ? 'var(--cyan-primary)' : 'var(--border-subtle)'}`,
              borderRadius: 10,
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                setError(null);
              }}
              style={{ marginTop: 2, cursor: 'pointer' }}
              disabled={isSubmitting}
            />
            <span>
              I confirm modifying physical inventory for <strong>{product.name}</strong> to{' '}
              <strong>{isValidInteger ? `${parsedNewStock} unit(s)` : '...'}</strong> in Cloud Firestore.
            </span>
          </label>

          {/* Error Message */}
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#fb7185',
                fontSize: 13,
                background: 'rgba(244, 63, 94, 0.1)',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid rgba(244, 63, 94, 0.25)',
              }}
            >
              <AlertTriangleIcon style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Modal Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ height: 44, padding: '0 20px' }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !isValidInteger || !confirmed}
              style={{ height: 44, width: 'auto', padding: '0 24px' }}
            >
              {isSubmitting ? (
                <>
                  <SpinnerIcon style={{ width: 16, height: 16 }} />
                  <span>Updating Firestore...</span>
                </>
              ) : (
                <span>Confirm & Update Stock</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
