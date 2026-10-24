import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth, type AccountRole } from '../context/AuthContext';
import { resetPassword } from '../services/authService';

interface AuthScreenProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthScreen({ onClose, onSuccess }: AuthScreenProps) {
  const { login, register, role } = useAuth();
  const [accountType, setAccountType] = useState<AccountRole>(role || 'customer');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setResetSent(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (accountType === 'customer' && mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      if (accountType === 'dealer') {
        await login(email, password, 'dealer');
      } else if (mode === 'login') {
        await login(email, password, 'customer');
      } else {
        await register(email, password);
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setResetSent(null);

    if (!email.trim()) {
      setError('Please enter your email address above to receive a password reset link.');
      return;
    }

    setIsResetting(true);
    try {
      await resetPassword(email);
      setResetSent(`Password reset email sent to ${email.trim()}. Please check your inbox.`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to send password reset email.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header with Close */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Feather name="x" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Brand Banner */}
        <View style={styles.brandBox}>
          <View style={styles.brandIconCircle}>
            <MaterialCommunityIcons name="water" size={32} color="#06b6d4" />
          </View>
          <Text style={styles.brandTitle}>Califnco Water</Text>
          <Text style={styles.brandSubtitle}>
            {accountType === 'dealer'
              ? 'Authorized Dealer Portal: Access commercial ordering, territory fulfillment, and warranty tracking.'
              : mode === 'login'
              ? 'Sign in to access your purifiers, order tracking, and doorstep service visits.'
              : 'Create an account to order certified purifiers with free installation.'}
          </Text>
        </View>

        {/* Account Role Selector (Customer vs Dealer) */}
        <View style={styles.roleContainer}>
          <TouchableOpacity
            style={[styles.roleBtn, accountType === 'customer' && styles.roleBtnActive]}
            onPress={() => {
              setAccountType('customer');
              setError(null);
            }}
            activeOpacity={0.8}
          >
            <Feather
              name="user"
              size={15}
              color={accountType === 'customer' ? '#fff' : '#94a3b8'}
            />
            <Text
              style={[
                styles.roleBtnText,
                accountType === 'customer' && styles.roleBtnTextActive,
              ]}
            >
              Customer Account
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleBtn, accountType === 'dealer' && styles.roleBtnActiveDealer]}
            onPress={() => {
              setAccountType('dealer');
              setMode('login'); // Dealers must be provisioned by admin
              setError(null);
            }}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="store-outline"
              size={17}
              color={accountType === 'dealer' ? '#0f172a' : '#94a3b8'}
            />
            <Text
              style={[
                styles.roleBtnText,
                accountType === 'dealer' && styles.roleBtnTextActiveDealer,
              ]}
            >
              Authorized Dealer
            </Text>
          </TouchableOpacity>
        </View>

        {/* Dealer Notice / Mode Switcher */}
        {accountType === 'dealer' ? (
          <View style={styles.dealerNoticeBox}>
            <MaterialCommunityIcons name="shield-check" size={18} color="#06b6d4" />
            <View style={{ flex: 1 }}>
              <Text style={styles.dealerNoticeTitle}>Authorized Dealership Sign In</Text>
              <Text style={styles.dealerNoticeDesc}>
                Dealer accounts are created and verified exclusively by Califnco corporate administration. Ordering privileges require an active, approved dealer profile.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, mode === 'login' && styles.tabBtnActive]}
              onPress={() => {
                setMode('login');
                setError(null);
                setResetSent(null);
              }}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, mode === 'register' && styles.tabBtnActive]}
              onPress={() => {
                setMode('register');
                setError(null);
                setResetSent(null);
              }}
            >
              <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
                Register
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Error Alert */}
        {error && (
          <View style={styles.errorBox}>
            <Feather name="alert-triangle" size={16} color="#f87171" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Success Alert */}
        {resetSent && (
          <View style={styles.successBox}>
            <Feather name="check-circle" size={16} color="#10b981" />
            <Text style={styles.successText}>{resetSent}</Text>
          </View>
        )}

        {/* Form Inputs */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>
            {accountType === 'dealer' ? 'Dealership Business Email' : 'Email Address'}
          </Text>
          <View style={styles.inputWrapper}>
            <Feather name="mail" size={16} color="#94a3b8" />
            <TextInput
              style={styles.textInput}
              placeholder={accountType === 'dealer' ? 'dealer@example.com' : 'customer@example.com'}
              placeholderTextColor="#64748b"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Password</Text>
          <View style={styles.inputWrapper}>
            <Feather name="lock" size={16} color="#94a3b8" />
            <TextInput
              style={styles.textInput}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Feather
                name={showPassword ? 'eye-off' : 'eye'}
                size={18}
                color="#94a3b8"
              />
            </TouchableOpacity>
          </View>
        </View>

        {accountType === 'customer' && mode === 'register' && (
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Confirm Password</Text>
            <View style={styles.inputWrapper}>
              <Feather name="lock" size={16} color="#94a3b8" />
              <TextInput
                style={styles.textInput}
                placeholder="••••••••"
                placeholderTextColor="#64748b"
                secureTextEntry={!showPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
              />
            </View>
          </View>
        )}

        {/* Forgot Password Link */}
        {(accountType === 'dealer' || mode === 'login') && (
          <TouchableOpacity
            style={styles.forgotBtn}
            onPress={handleForgotPassword}
            disabled={isResetting || loading}
          >
            <Text style={styles.forgotText}>
              {isResetting ? 'Sending Reset Link...' : 'Forgot Password?'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            accountType === 'dealer' && styles.submitBtnDealer,
            loading && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              style={[
                styles.submitBtnText,
                accountType === 'dealer' && styles.submitBtnTextDealer,
              ]}
            >
              {accountType === 'dealer'
                ? 'Sign In as Authorized Dealer'
                : mode === 'login'
                ? 'Sign In to Califnco'
                : 'Create Customer Account'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.privacyNote}>
          {accountType === 'dealer'
            ? 'Dealer access is governed by the Califnco Authorized Partner Agreement and territorial guidelines.'
            : 'By signing in, you agree to Califnco Water Solutions customer terms and warranty policy.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 36,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  brandIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 6,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  roleContainer: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    gap: 4,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  roleBtnActive: {
    backgroundColor: '#0284c7',
  },
  roleBtnActiveDealer: {
    backgroundColor: '#06b6d4',
  },
  roleBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  roleBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  roleBtnTextActiveDealer: {
    color: '#0f172a',
    fontWeight: '800',
  },
  dealerNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
  },
  dealerNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#06b6d4',
    marginBottom: 2,
  },
  dealerNoticeDesc: {
    fontSize: 11,
    color: '#cbd5e1',
    lineHeight: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#0284c7',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: '#34d399',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#cbd5e1',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    gap: 10,
  },
  textInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
    padding: 0,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotText: {
    color: '#06b6d4',
    fontSize: 12,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  submitBtnDealer: {
    backgroundColor: '#06b6d4',
  },
  submitBtnDisabled: {
    backgroundColor: '#334155',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  submitBtnTextDealer: {
    color: '#0f172a',
    fontWeight: '800',
  },
  privacyNote: {
    textAlign: 'center',
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },
});
