import { useState, useEffect, type FormEvent } from 'react';
import type {
  Dealer,
  DealerInput,
  DealerTier,
  DealerStatus,
} from '../../services/dealerService';
import {
  isValidEmail,
  isValidPhone,
  isValidPostalCode,
  isValidGSTIN,
  DEALER_TIER_CONFIG,
} from '../../services/dealerService';
import { CloseIcon, SpinnerIcon, AlertTriangleIcon } from '../common/Icons';

interface DealerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DealerInput) => Promise<void>;
  initialDealer?: Dealer | null;
}

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi NCR',
  'Chandigarh',
];

export function DealerModal({
  isOpen,
  onClose,
  onSubmit,
  initialDealer,
}: DealerModalProps) {
  const [businessName, setBusinessName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Karnataka');
  const [postalCode, setPostalCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [tier, setTier] = useState<DealerTier>('silver');
  const [status, setStatus] = useState<DealerStatus>('active');
  const [installedBaseCount, setInstalledBaseCount] = useState<string>('0');
  const [notes, setNotes] = useState('');
  const [userId, setUserId] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (initialDealer) {
      setBusinessName(initialDealer.businessName);
      setContactPerson(initialDealer.contactPerson);
      setEmail(initialDealer.email);
      setPhone(initialDealer.phone);
      setStreet(initialDealer.address.street);
      setCity(initialDealer.address.city);
      setState(initialDealer.address.state || 'Karnataka');
      setPostalCode(initialDealer.address.postalCode);
      setGstin(initialDealer.gstin || '');
      setTier(initialDealer.tier);
      setStatus(initialDealer.status);
      setInstalledBaseCount(String(initialDealer.installedBaseCount ?? 0));
      setNotes(initialDealer.notes || '');
      setUserId(initialDealer.userId || '');
    } else {
      setBusinessName('');
      setContactPerson('');
      setEmail('');
      setPhone('');
      setStreet('');
      setCity('');
      setState('Karnataka');
      setPostalCode('');
      setGstin('');
      setTier('silver');
      setStatus('active');
      setInstalledBaseCount('0');
      setNotes('');
      setUserId('');
    }
    setErrors({});
    setServerError(null);
  }, [initialDealer, isOpen]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!businessName.trim() || businessName.trim().length < 3) {
      newErrors.businessName = 'Business name is required (minimum 3 characters).';
    }

    if (!contactPerson.trim() || contactPerson.trim().length < 3) {
      newErrors.contactPerson = 'Contact person name is required (minimum 3 characters).';
    }

    if (!email.trim() || !isValidEmail(email)) {
      newErrors.email = 'A valid business email address is required.';
    }

    if (!phone.trim() || !isValidPhone(phone)) {
      newErrors.phone = 'Valid phone number required (e.g. 9876543210 or +91 98765 43210).';
    }

    if (!street.trim()) {
      newErrors.street = 'Street address / premises is required.';
    }

    if (!city.trim()) {
      newErrors.city = 'City or hub town is required.';
    }

    if (!postalCode.trim() || !isValidPostalCode(postalCode)) {
      newErrors.postalCode = 'Valid 6-digit Indian PIN code required (e.g. 560001).';
    }

    if (gstin.trim() && !isValidGSTIN(gstin)) {
      newErrors.gstin = 'Invalid GSTIN (must be standard 15-character format, e.g. 29ABCDE1234F1Z5).';
    }

    const numBase = Number(installedBaseCount);
    if (isNaN(numBase) || numBase < 0 || !Number.isInteger(numBase)) {
      newErrors.installedBaseCount = 'Installed base count must be 0 or a positive whole number.';
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
        businessName: businessName.trim(),
        contactPerson: contactPerson.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: {
          street: street.trim(),
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
        },
        gstin: gstin.trim() ? gstin.trim().toUpperCase() : undefined,
        tier,
        status,
        installedBaseCount: Math.floor(Number(installedBaseCount || 0)),
        notes: notes.trim() || undefined,
        userId: userId.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || 'Failed to save dealer in Cloud Firestore.';
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
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
          maxWidth: 700,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(6, 182, 212, 0.15)',
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
              {initialDealer ? `Edit Dealer (${initialDealer.dealerCode})` : 'Register Authorized Dealer / Partner'}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              {initialDealer
                ? 'Update dealer organization, tier, territorial assignment, and status.'
                : 'Create a new authorized distributor, regional stockist, or certified service center.'}
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
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1, padding: 24 }}>
          {serverError && (
            <div className="banner-alert banner-error" style={{ marginBottom: 20 }}>
              <AlertTriangleIcon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
              <span>{serverError}</span>
            </div>
          )}

          {/* Section 1: Business Identification */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--cyan-primary)', letterSpacing: '0.05em', marginBottom: 12, fontWeight: 700 }}>
              1. Business Identification
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label" htmlFor="businessName">
                  Business / Franchise Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="businessName"
                  type="text"
                  className="form-input"
                  placeholder="e.g. AquaTech Water Solutions Pvt Ltd"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.businessName && <div className="form-error">{errors.businessName}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="contactPerson">
                  Primary Contact Person <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="contactPerson"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Sunil Rao"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.contactPerson && <div className="form-error">{errors.contactPerson}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="gstin">
                  GSTIN (Tax ID - Optional)
                </label>
                <input
                  id="gstin"
                  type="text"
                  className="form-input"
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                  style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
                />
                {errors.gstin && <div className="form-error">{errors.gstin}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="email">
                  Business Email <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="e.g. partner@aquatech.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.email && <div className="form-error">{errors.email}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="phone">
                  Phone / Mobile Number <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  className="form-input"
                  placeholder="e.g. +91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.phone && <div className="form-error">{errors.phone}</div>}
              </div>
            </div>
          </div>

          {/* Section 2: Address & Territory */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--cyan-primary)', letterSpacing: '0.05em', marginBottom: 12, fontWeight: 700 }}>
              2. Service Territory & Premises Address
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label" htmlFor="street">
                  Street Address & Landmark <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="street"
                  type="text"
                  className="form-input"
                  placeholder="e.g. #45, Industrial Suburb, 2nd Stage, Peenya"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.street && <div className="form-error">{errors.street}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="city">
                  City / Territory Hub <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="city"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Bengaluru"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.city && <div className="form-error">{errors.city}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="state">
                  State / Region <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  id="state"
                  className="form-input"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  disabled={isSubmitting}
                  style={{ cursor: 'pointer' }}
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="postalCode">
                  Postal PIN Code <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="postalCode"
                  type="text"
                  className="form-input"
                  placeholder="e.g. 560058"
                  maxLength={6}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.postalCode && <div className="form-error">{errors.postalCode}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="installedBase">
                  Installed Base Purifiers (Count)
                </label>
                <input
                  id="installedBase"
                  type="number"
                  className="form-input"
                  placeholder="0"
                  min="0"
                  value={installedBaseCount}
                  onChange={(e) => setInstalledBaseCount(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.installedBaseCount && <div className="form-error">{errors.installedBaseCount}</div>}
              </div>
            </div>
          </div>

          {/* Section 3: Tier, Status & Notes */}
          <div style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--cyan-primary)', letterSpacing: '0.05em', marginBottom: 12, fontWeight: 700 }}>
              3. Partnership Tier & Authorization Status
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="tier">
                  Partner Tier <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  id="tier"
                  className="form-input"
                  value={tier}
                  onChange={(e) => setTier(e.target.value as DealerTier)}
                  disabled={isSubmitting}
                  style={{ cursor: 'pointer' }}
                >
                  {(Object.keys(DEALER_TIER_CONFIG) as DealerTier[]).map((tKey) => (
                    <option key={tKey} value={tKey}>
                      {DEALER_TIER_CONFIG[tKey].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="status">
                  Account Status <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  id="status"
                  className="form-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DealerStatus)}
                  disabled={isSubmitting}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="active">Active (Verified & Authorized)</option>
                  <option value="pending">Pending (Awaiting Verification)</option>
                  <option value="suspended">Suspended (Authorization Frozen)</option>
                </select>
              </div>

              {/* Status Notice */}
              {status === 'suspended' && (
                <div
                  style={{
                    gridColumn: 'span 2',
                    padding: 12,
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#f87171',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Notice regarding suspension:</strong> Marking this dealer as <em>Suspended</em> updates their organizational status in the directory. Note that this record update does not automatically revoke Firebase Authentication credentials until dedicated backend authorization rules enforce it.
                </div>
              )}

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label" htmlFor="notes">
                  Territory Notes / Contract Sign-off (Optional)
                </label>
                <textarea
                  id="notes"
                  className="form-input"
                  rows={3}
                  placeholder="e.g. Exclusive distribution rights for Peenya and Yeshwanthpur zones. SLA requires 24h installation."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isSubmitting}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label" htmlFor="userId">
                  Dealer Firebase Auth UID (Optional)
                </label>
                <input
                  id="userId"
                  type="text"
                  className="form-input"
                  placeholder="e.g. 7d8F9a2B... (links dealership profile to mobile app login)"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  disabled={isSubmitting}
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Paste the Firebase Authentication UID to link this authorized dealer profile to the mobile application.
                </span>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
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
              disabled={isSubmitting}
              style={{ minWidth: 160 }}
            >
              {isSubmitting ? (
                <>
                  <SpinnerIcon style={{ width: 16, height: 16 }} className="animate-spin" />
                  <span>Saving in Firestore...</span>
                </>
              ) : (
                <span>{initialDealer ? 'Update Dealer' : 'Register Dealer'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
