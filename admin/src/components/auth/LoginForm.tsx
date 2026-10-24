import { useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  sendResetPasswordEmail,
  getFriendlyResetErrorMessage,
} from '../../services/authService';
import {
  LogoIcon,
  EyeIcon,
  EyeOffIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
} from '../common/Icons';

export function LoginForm() {
  const { login, loading: authLoading, authError, clearError } = useAuth();
  const [mode, setMode] = useState<'login' | 'forgot_password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Password reset local state
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setValidationError('Please enter your administrator email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setValidationError('Please enter a valid email format (e.g. admin@califnco.com).');
      return;
    }

    if (!password) {
      setValidationError('Please enter your password.');
      return;
    }

    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters long.');
      return;
    }

    try {
      await login(trimmedEmail, password);
    } catch {
      // Handled in AuthContext
    }
  };

  const handleResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setResetError(null);
    setResetSuccess(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setValidationError('Please enter your administrator email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setValidationError('Please enter a valid email address.');
      return;
    }

    setResetLoading(true);
    try {
      await sendResetPasswordEmail(trimmedEmail);
      setResetSuccess(
        `Password reset email sent to ${trimmedEmail}! Please check your inbox and spam folder.`
      );
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      const friendlyMessage = getFriendlyResetErrorMessage(firebaseError?.code || '');
      setResetError(friendlyMessage);
    } finally {
      setResetLoading(false);
    }
  };

  const activeLoginError = validationError || authError;
  const activeResetError = validationError || resetError;

  return (
    <div className="auth-container">
      <div className="auth-water-glow" />

      <div className="auth-card animate-fade-in">
        <div className="auth-header">
          <div className="auth-logo">
            <LogoIcon style={{ width: 56, height: 56 }} />
          </div>
          <h1 className="auth-title">
            {mode === 'login' ? 'Califnco Operations' : 'Reset Password'}
          </h1>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Water Purifier E-Commerce & Service Administration'
              : 'Enter your admin email to receive a secure password reset link'}
          </p>
        </div>

        {mode === 'login' ? (
          <>
            {activeLoginError && (
              <div className="banner-alert banner-error" role="alert">
                <AlertTriangleIcon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
                <span>{activeLoginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="admin-email">
                  Admin Email
                </label>
                <div className="input-wrapper">
                  <input
                    id="admin-email"
                    type="email"
                    className="form-input"
                    placeholder="admin@califnco.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (activeLoginError) {
                        setValidationError(null);
                        clearError();
                      }
                    }}
                    disabled={authLoading}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" htmlFor="admin-password" style={{ margin: 0 }}>
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot_password');
                      setValidationError(null);
                      setResetError(null);
                      setResetSuccess(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--cyan-primary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="input-wrapper">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (activeLoginError) {
                        setValidationError(null);
                        clearError();
                      }
                    }}
                    disabled={authLoading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="input-adornment-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOffIcon style={{ width: 18, height: 18 }} />
                    ) : (
                      <EyeIcon style={{ width: 18, height: 18 }} />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={authLoading}
              >
                {authLoading ? (
                  <>
                    <SpinnerIcon style={{ width: 18, height: 18 }} />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon style={{ width: 18, height: 18 }} />
                    <span>Sign In to Admin Portal</span>
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          <>
            {resetSuccess && (
              <div className="banner-alert banner-info" role="status">
                <CheckCircleIcon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2, color: '#34d399' }} />
                <span>{resetSuccess}</span>
              </div>
            )}

            {activeResetError && (
              <div className="banner-alert banner-error" role="alert">
                <AlertTriangleIcon style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
                <span>{activeResetError}</span>
              </div>
            )}

            <form onSubmit={handleResetSubmit} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="reset-email">
                  Admin Email
                </label>
                <div className="input-wrapper">
                  <input
                    id="reset-email"
                    type="email"
                    className="form-input"
                    placeholder="admin@califnco.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (activeResetError) {
                        setValidationError(null);
                        setResetError(null);
                      }
                    }}
                    disabled={resetLoading}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <>
                      <SpinnerIcon style={{ width: 18, height: 18 }} />
                      <span>Sending Reset Link...</span>
                    </>
                  ) : (
                    <span>Send Password Reset Email</span>
                  )}
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setMode('login');
                    setValidationError(null);
                    setResetError(null);
                    setResetSuccess(null);
                  }}
                  disabled={resetLoading}
                  style={{ width: '100%', height: 44 }}
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          </>
        )}

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
          Protected by Firebase Authentication & Role Access Verification.
        </div>
      </div>
    </div>
  );
}
