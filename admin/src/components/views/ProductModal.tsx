import { useState, useEffect, type FormEvent } from 'react';
import type { Product, ProductInput, ProductCategory } from '../../services/productService';
import { CloseIcon, SpinnerIcon, AlertTriangleIcon } from '../common/Icons';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProductInput) => Promise<void>;
  initialProduct?: Product | null;
}

const CATEGORIES: { value: ProductCategory; label: string }[] = [
  { value: 'ro-purifiers', label: 'Smart RO Water Purifier' },
  { value: 'uv-uf-purifiers', label: 'UV + UF Purifier' },
  { value: 'cartridges', label: 'Filter Cartridge & Mineralizer' },
  { value: 'spare-parts', label: 'Spare Parts & IoT Accessories' },
];

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&w=600&q=80';

export function ProductModal({
  isOpen,
  onClose,
  onSubmit,
  initialProduct,
}: ProductModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProductCategory>('ro-purifiers');
  const [price, setPrice] = useState<string>('');
  const [stock, setStock] = useState<string>('');
  const [imageUrl, setImageUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProduct) {
      setName(initialProduct.name);
      setDescription(initialProduct.description || '');
      setCategory(initialProduct.category || 'ro-purifiers');
      setPrice(String(initialProduct.price || ''));
      setStock(String(initialProduct.stock ?? ''));
      setImageUrl(initialProduct.imageUrl || '');
    } else {
      setName('');
      setDescription('');
      setCategory('ro-purifiers');
      setPrice('');
      setStock('10');
      setImageUrl(DEFAULT_IMAGE);
    }
    setErrors({});
    setServerError(null);
  }, [initialProduct, isOpen]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim() || name.trim().length < 3) {
      newErrors.name = 'Product name is required (minimum 3 characters).';
    }

    if (!description.trim() || description.trim().length < 10) {
      newErrors.description = 'Description is required (minimum 10 characters).';
    }

    const numPrice = Number(price);
    if (!price || isNaN(numPrice) || numPrice <= 0) {
      newErrors.price = 'Price must be a valid positive number greater than 0.';
    }

    const numStock = Number(stock);
    if (stock === '' || isNaN(numStock) || numStock < 0 || !Number.isInteger(numStock)) {
      newErrors.stock = 'Stock quantity must be a non-negative integer (0 or greater).';
    }

    if (
      imageUrl.trim() &&
      !/^https?:\/\//i.test(imageUrl.trim()) &&
      !imageUrl.trim().startsWith('/products/') &&
      !imageUrl.trim().startsWith('assets/')
    ) {
      newErrors.imageUrl = 'Image URL must be a valid web address (http://, https://) or local asset path (/products/product-XX.png).';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        category,
        price: Number(price),
        stock: Math.floor(Number(stock)),
        imageUrl: imageUrl.trim() || DEFAULT_IMAGE,
      });
      onClose();
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || 'Failed to save product in Firestore.';
      setServerError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
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
          maxWidth: 580,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(6, 182, 212, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
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
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
              {initialProduct ? 'Edit Water Purifier Product' : 'Add New Water Purifier Product'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {initialProduct ? 'Update specifications in Cloud Firestore' : 'Create a new catalog entry in Cloud Firestore'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {serverError && (
            <div className="banner-alert banner-error" style={{ marginBottom: 16 }}>
              <AlertTriangleIcon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
              <span>{serverError}</span>
            </div>
          )}

          {/* Product Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="prod-name">
              Product Name *
            </label>
            <input
              id="prod-name"
              type="text"
              className="form-input"
              placeholder="e.g. Califnco PurePro Alkaline RO+UV"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
              disabled={isSubmitting}
            />
            {errors.name && (
              <span style={{ color: '#fda4af', fontSize: 12, marginTop: 4, display: 'block' }}>
                {errors.name}
              </span>
            )}
          </div>

          {/* Category & Price Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="prod-category">
                Category *
              </label>
              <select
                id="prod-category"
                className="form-input"
                style={{ cursor: 'pointer' }}
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                disabled={isSubmitting}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value} style={{ background: '#0f172a' }}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="prod-price">
                Price (INR ₹) *
              </label>
              <input
                id="prod-price"
                type="number"
                min="1"
                step="1"
                className="form-input"
                placeholder="18499"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  if (errors.price) setErrors((prev) => ({ ...prev, price: '' }));
                }}
                disabled={isSubmitting}
              />
              {errors.price && (
                <span style={{ color: '#fda4af', fontSize: 12, marginTop: 4, display: 'block' }}>
                  {errors.price}
                </span>
              )}
            </div>
          </div>

          {/* Stock & Image URL Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="prod-stock">
                Stock Units *
              </label>
              <input
                id="prod-stock"
                type="number"
                min="0"
                step="1"
                className="form-input"
                placeholder="25"
                value={stock}
                onChange={(e) => {
                  setStock(e.target.value);
                  if (errors.stock) setErrors((prev) => ({ ...prev, stock: '' }));
                }}
                disabled={isSubmitting}
              />
              {errors.stock && (
                <span style={{ color: '#fda4af', fontSize: 12, marginTop: 4, display: 'block' }}>
                  {errors.stock}
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="prod-image">
                Image URL (HTTPS)
              </label>
              <input
                id="prod-image"
                type="url"
                className="form-input"
                placeholder="https://images.unsplash.com/..."
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  if (errors.imageUrl) setErrors((prev) => ({ ...prev, imageUrl: '' }));
                }}
                disabled={isSubmitting}
              />
              {errors.imageUrl && (
                <span style={{ color: '#fda4af', fontSize: 12, marginTop: 4, display: 'block' }}>
                  {errors.imageUrl}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label" htmlFor="prod-desc">
              Filtration & Technical Specifications *
            </label>
            <textarea
              id="prod-desc"
              rows={3}
              className="form-input"
              style={{ height: 'auto', padding: '12px 16px', resize: 'vertical' }}
              placeholder="e.g. 8 Stages Purification, Copper + Alkaline Enrichment, 10 Litres Food Grade Tank, TDS up to 2000 ppm..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) setErrors((prev) => ({ ...prev, description: '' }));
              }}
              disabled={isSubmitting}
            />
            {errors.description && (
              <span style={{ color: '#fda4af', fontSize: 12, marginTop: 4, display: 'block' }}>
                {errors.description}
              </span>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ width: 'auto', padding: '0 24px' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <SpinnerIcon style={{ width: 16, height: 16 }} />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{initialProduct ? 'Update Product' : 'Add to Catalog'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
