import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { DEALER_TIER_CONFIG } from '../types/dealer';

interface ProfileScreenProps {
  onRequireAuth: () => void;
  onNavigateToOrders: () => void;
}

export function ProfileScreen({ onRequireAuth, onNavigateToOrders }: ProfileScreenProps) {
  const {
    user,
    logout,
    role,
    setRole,
    dealerProfile,
    isDealerActive,
    dealerStatus,
    dealerMessage,
  } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isDealer = role === 'dealer';
  const tierConfig = dealerProfile?.tier ? DEALER_TIER_CONFIG[dealerProfile.tier] : null;

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      `Are you sure you want to sign out of your Califnco ${isDealer ? 'Dealership' : 'Customer'} account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await logout();
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handleToggleRole = () => {
    if (isDealer) {
      setRole('customer');
    } else {
      setRole('dealer');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Account Info Card */}
      {user ? (
        <View style={[styles.userCard, isDealer && styles.userCardDealer]}>
          <View style={[styles.avatarCircle, isDealer && styles.avatarCircleDealer]}>
            <MaterialCommunityIcons
              name={isDealer ? 'store' : 'account'}
              size={26}
              color={isDealer ? '#0f172a' : '#0f172a'}
            />
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.userEmail}>
              {isDealer && dealerProfile?.businessName
                ? dealerProfile.businessName
                : user.email}
            </Text>

            {isDealer ? (
              <View style={styles.dealerTagsContainer}>
                {dealerProfile?.dealerCode && (
                  <View style={styles.codePill}>
                    <Text style={styles.codeText}>{dealerProfile.dealerCode}</Text>
                  </View>
                )}
                {tierConfig && (
                  <View style={[styles.tierPill, { borderColor: tierConfig.badgeColor }]}>
                    <Text style={[styles.tierText, { color: tierConfig.badgeColor }]}>
                      {tierConfig.label}
                    </Text>
                  </View>
                )}
                <View
                  style={[
                    styles.statusPill,
                    isDealerActive ? styles.statusPillActive : styles.statusPillWarning,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      isDealerActive ? styles.statusTextActive : styles.statusTextWarning,
                    ]}
                  >
                    {isDealerActive
                      ? 'Approved & Active'
                      : dealerStatus === 'pending_approval'
                      ? 'Pending Approval'
                      : dealerStatus === 'suspended'
                      ? 'Suspended'
                      : dealerStatus === 'unlinked'
                      ? 'Unlinked Profile'
                      : 'Unverified'}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.verifiedTag}>
                <Feather name="check-circle" size={12} color="#10b981" />
                <Text style={styles.verifiedText}>Verified Customer Account</Text>
              </View>
            )}

            <Text style={styles.uidText}>UID: {user.uid.slice(0, 18)}...</Text>
          </View>
        </View>
      ) : (
        <View style={styles.guestCard}>
          <View style={styles.guestIconCircle}>
            <Feather name="user" size={32} color="#64748b" />
          </View>
          <Text style={styles.guestTitle}>Welcome to Califnco</Text>
          <Text style={styles.guestDesc}>
            Sign in to track orders, manage purifier installations, or access the authorized dealer portal.
          </Text>
          <TouchableOpacity style={styles.loginBtn} onPress={onRequireAuth} activeOpacity={0.8}>
            <Feather name="log-in" size={16} color="#0f172a" />
            <Text style={styles.loginBtnText}>Sign In / Register</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Account Mode Switcher */}
      {user && (
        <View style={styles.roleSwitchCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleSwitchTitle}>
              Current Mode: <Text style={{ color: isDealer ? '#fbbf24' : '#06b6d4' }}>{isDealer ? 'Authorized Dealership' : 'Retail Customer'}</Text>
            </Text>
            <Text style={styles.roleSwitchSubtitle}>
              {isDealer
                ? 'Switch to standard retail customer view to browse as a consumer.'
                : 'Registered as a partner? Switch to access commercial dealer stock and dispatch.'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.switchModeBtn, isDealer && styles.switchModeBtnDealer]}
            onPress={handleToggleRole}
            activeOpacity={0.8}
          >
            <Feather
              name="refresh-cw"
              size={14}
              color={isDealer ? '#0f172a' : '#fff'}
            />
            <Text style={[styles.switchModeBtnText, isDealer && styles.switchModeBtnTextDealer]}>
              {isDealer ? 'Customer View' : 'Dealer Portal'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Dealer Status Notice if inactive */}
      {isDealer && !isDealerActive && (
        <View style={styles.dealerWarningCard}>
          <Feather name="alert-triangle" size={18} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={styles.dealerWarningTitle}>Dealership Status Notice</Text>
            <Text style={styles.dealerWarningText}>
              {dealerMessage ||
                'Your dealer account is currently not active or not linked to this Firebase UID. Ordering privileges are disabled until verified by an administrator.'}
            </Text>
          </View>
        </View>
      )}

      {/* Quick Links Menu */}
      <View style={styles.menuSection}>
        <Text style={styles.menuHeading}>
          {isDealer ? 'Dealership Operations' : 'Quick Actions'}
        </Text>

        <TouchableOpacity style={styles.menuItem} onPress={onNavigateToOrders} activeOpacity={0.7}>
          <View style={styles.menuItemLeft}>
            <View style={styles.menuIconBox}>
              <Feather name="clipboard" size={18} color="#06b6d4" />
            </View>
            <View>
              <Text style={styles.menuItemTitle}>
                {isDealer ? 'Dealer Stock Orders & Dispatch' : 'My Orders & Installations'}
              </Text>
              <Text style={styles.menuItemSubtitle}>
                {isDealer
                  ? 'Track bulk purifier dispatches and warehouse delivery status'
                  : 'Track delivery, dispatch & technician TDS logs'}
              </Text>
            </View>
          </View>
          <Feather name="chevron-right" size={18} color="#64748b" />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <View style={styles.menuItem}>
          <View style={styles.menuItemLeft}>
            <View style={styles.menuIconBox}>
              <MaterialCommunityIcons name="shield-check" size={18} color="#06b6d4" />
            </View>
            <View>
              <Text style={styles.menuItemTitle}>Warranty & Compliance</Text>
              <Text style={styles.menuItemSubtitle}>
                Standard 1-year certified pump & membrane warranty coverage
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Dealership Info if Dealer */}
      {isDealer && dealerProfile && (
        <View style={styles.dealershipInfoCard}>
          <Text style={styles.menuHeading}>Registered Dealership Entity</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Business Name:</Text>
            <Text style={styles.infoValue}>{dealerProfile.businessName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Authorized Contact:</Text>
            <Text style={styles.infoValue}>{dealerProfile.contactPerson}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Registered Phone:</Text>
            <Text style={styles.infoValue}>{dealerProfile.phone}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Dispatch Warehouse:</Text>
            <Text style={styles.infoValue}>
              {dealerProfile.address.street}, {dealerProfile.address.city}, {dealerProfile.address.state} - {dealerProfile.address.postalCode}
            </Text>
          </View>
          {dealerProfile.gstin && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>GSTIN:</Text>
              <Text style={[styles.infoValue, { fontFamily: 'monospace' }]}>{dealerProfile.gstin}</Text>
            </View>
          )}
          {tierConfig && (
            <View style={styles.tierInfoBox}>
              <Text style={styles.tierInfoTitle}>Territorial Coverage:</Text>
              <Text style={styles.tierInfoDesc}>{tierConfig.description}</Text>
            </View>
          )}
        </View>
      )}

      {/* Customer Helpline Card */}
      <View style={styles.supportCard}>
        <View style={styles.supportHeader}>
          <Feather name="headphones" size={20} color="#06b6d4" />
          <Text style={styles.supportTitle}>
            {isDealer ? 'Califnco Corporate Partner Support' : 'Califnco Customer Helpline'}
          </Text>
        </View>
        <Text style={styles.supportText}>
          {isDealer
            ? 'Need priority stock allocation, territory escalation, or warranty parts dispatch? Contact your assigned zonal manager.'
            : 'Need urgent filter service, relocation, or TDS water testing? Our technicians are stationed regionally across major hubs.'}
        </Text>
        <View style={styles.contactRow}>
          <View style={styles.contactItem}>
            <Feather name="phone-call" size={14} color="#06b6d4" />
            <Text style={styles.contactText}>1800-CALIFNCO (Toll-Free)</Text>
          </View>
          <View style={styles.contactItem}>
            <Feather name="mail" size={14} color="#06b6d4" />
            <Text style={styles.contactText}>
              {isDealer ? 'dealers@califnco.com' : 'support@califnco.com'}
            </Text>
          </View>
        </View>
      </View>

      {/* Sign Out Button */}
      {user && (
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          disabled={isLoggingOut}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={16} color="#ef4444" />
          <Text style={styles.signOutText}>
            {isLoggingOut ? 'Signing Out...' : `Sign Out of ${isDealer ? 'Dealership' : 'Califnco'}`}
          </Text>
        </TouchableOpacity>
      )}

      {/* App Version Tag */}
      <Text style={styles.versionText}>Califnco Mobile App • v1.1.0 (Dealer & Customer Release)</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    marginBottom: 16,
    gap: 14,
  },
  userCardDealer: {
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#06b6d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleDealer: {
    backgroundColor: '#fbbf24',
  },
  userMeta: {
    flex: 1,
  },
  userEmail: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  verifiedText: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
  },
  uidText: {
    fontSize: 10,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  dealerTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  codePill: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8',
    fontFamily: 'monospace',
  },
  tierPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: '#0f172a',
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusPillWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#34d399',
  },
  statusTextWarning: {
    color: '#fbbf24',
  },
  guestCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  guestIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  guestTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 6,
  },
  guestDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#06b6d4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  loginBtnText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  roleSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    gap: 12,
  },
  roleSwitchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 2,
  },
  roleSwitchSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 15,
  },
  switchModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  switchModeBtnDealer: {
    backgroundColor: '#fbbf24',
  },
  switchModeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  switchModeBtnTextDealer: {
    color: '#0f172a',
  },
  dealerWarningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  dealerWarningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fbbf24',
    marginBottom: 2,
  },
  dealerWarningText: {
    fontSize: 11,
    color: '#cbd5e1',
    lineHeight: 16,
  },
  menuSection: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    marginBottom: 20,
  },
  menuHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
  },
  menuItemSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    marginVertical: 4,
  },
  dealershipInfoCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  infoRow: {
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8fafc',
  },
  tierInfoBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.1)',
  },
  tierInfoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#06b6d4',
    marginBottom: 2,
  },
  tierInfoDesc: {
    fontSize: 11,
    color: '#cbd5e1',
    lineHeight: 16,
  },
  supportCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    marginBottom: 20,
  },
  supportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  supportTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#06b6d4',
  },
  supportText: {
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 18,
    marginBottom: 12,
  },
  contactRow: {
    gap: 6,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f8fafc',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 20,
  },
  signOutText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 11,
    color: '#475569',
    marginTop: 4,
  },
});
