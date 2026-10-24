import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { DEALER_TIER_CONFIG } from '../types/dealer';

interface DealerDashboardScreenProps {
  onNavigateToProducts: () => void;
  onNavigateToCart: () => void;
  onNavigateToOrders: () => void;
  onRequireAuth: () => void;
}

export function DealerDashboardScreen({
  onNavigateToProducts,
  onNavigateToCart,
  onNavigateToOrders,
  onRequireAuth,
}: DealerDashboardScreenProps) {
  const {
    user,
    dealerProfile,
    dealerStatus,
    dealerMessage,
    isDealerActive,
    refreshDealerProfile,
  } = useAuth();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshDealerProfile();
    setRefreshing(false);
  };

  // If unauthenticated
  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="store" size={38} color="#06b6d4" />
        </View>
        <Text style={styles.centerTitle}>Dealer Portal Access</Text>
        <Text style={styles.centerSubtitle}>
          Please sign in with your authorized dealership credentials to access commercial stock ordering, dispatch tracking, and dealer account details.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onRequireAuth} activeOpacity={0.8}>
          <Feather name="log-in" size={16} color="#0f172a" />
          <Text style={styles.primaryBtnText}>Sign In as Dealer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tierConfig = dealerProfile?.tier
    ? DEALER_TIER_CONFIG[dealerProfile.tier]
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />
      }
    >
      {/* Top Welcome / Status Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.portalTag}>AUTHORIZED DEALER PORTAL</Text>
            <Text style={styles.businessName}>
              {dealerProfile?.businessName || user.email}
            </Text>
          </View>
          {dealerProfile?.dealerCode && (
            <View style={styles.dealerCodeBadge}>
              <Text style={styles.dealerCodeText}>{dealerProfile.dealerCode}</Text>
            </View>
          )}
        </View>

        {/* Tier & Status Pills */}
        <View style={styles.pillsRow}>
          {tierConfig && (
            <View style={[styles.tierPill, { borderColor: tierConfig.badgeColor }]}>
              <MaterialCommunityIcons name="shield-star" size={14} color={tierConfig.badgeColor} />
              <Text style={[styles.tierText, { color: tierConfig.badgeColor }]}>
                {tierConfig.label}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.statusPill,
              isDealerActive ? styles.statusPillActive : styles.statusPillPending,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                isDealerActive ? styles.statusDotActive : styles.statusDotPending,
              ]}
            />
            <Text
              style={[
                styles.statusText,
                isDealerActive ? styles.statusTextActive : styles.statusTextPending,
              ]}
            >
              {isDealerActive
                ? 'Account Verified & Active'
                : dealerStatus === 'pending_approval'
                ? 'Pending Approval'
                : dealerStatus === 'suspended'
                ? 'Account Suspended'
                : dealerStatus === 'unlinked'
                ? 'UID Link Required'
                : 'Status Unverified'}
            </Text>
          </View>
        </View>
      </View>

      {/* Account Verification Warning Banner if not active */}
      {!isDealerActive && (
        <View style={styles.alertCard}>
          <Feather name="alert-triangle" size={20} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>Ordering Privileges Restricted</Text>
            <Text style={styles.alertDesc}>
              {dealerMessage ||
                'Your dealer profile is not active. Commercial ordering privileges require an approved, active profile linked to your authenticated Firebase UID.'}
            </Text>
            <Text style={styles.alertUid}>
              Authenticated UID: <Text style={{ fontFamily: 'monospace' }}>{user.uid}</Text>
            </Text>
          </View>
        </View>
      )}

      {/* Pricing Policy Notice (Requirement 3) */}
      <View style={styles.pricingPolicyCard}>
        <MaterialCommunityIcons name="information-outline" size={18} color="#06b6d4" />
        <View style={{ flex: 1 }}>
          <Text style={styles.pricingPolicyTitle}>Dealer Pricing Policy</Text>
          <Text style={styles.pricingPolicyText}>
            Dealer-specific wholesale pricing is not configured. Standard catalogue prices apply to all purifier units and replacement cartridges.
          </Text>
        </View>
      </View>

      {/* Quick Action Grid */}
      <Text style={styles.sectionHeading}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={onNavigateToProducts}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconBox, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
            <Feather name="grid" size={22} color="#06b6d4" />
          </View>
          <Text style={styles.actionCardTitle}>Stock Catalogue</Text>
          <Text style={styles.actionCardDesc}>Browse certified RO & UV units with live inventory</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={onNavigateToCart}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconBox, { backgroundColor: 'rgba(2, 132, 199, 0.15)' }]}>
            <Feather name="shopping-cart" size={22} color="#38bdf8" />
          </View>
          <Text style={styles.actionCardTitle}>Dealer Cart</Text>
          <Text style={styles.actionCardDesc}>Review stock orders, white-glove dispatch & tax</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={onNavigateToOrders}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <Feather name="clipboard" size={22} color="#10b981" />
          </View>
          <Text style={styles.actionCardTitle}>Dealer Orders</Text>
          <Text style={styles.actionCardDesc}>Track dispatch, transit & technician installations</Text>
        </TouchableOpacity>
      </View>

      {/* Dealership Profile Summary */}
      {dealerProfile && (
        <View style={styles.profileBox}>
          <Text style={styles.sectionHeading}>Registered Business Details</Text>

          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Contact Person:</Text>
            <Text style={styles.profileValue}>{dealerProfile.contactPerson}</Text>
          </View>

          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Registered Phone:</Text>
            <Text style={styles.profileValue}>{dealerProfile.phone}</Text>
          </View>

          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Business Email:</Text>
            <Text style={styles.profileValue}>{dealerProfile.email}</Text>
          </View>

          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Dispatch Address:</Text>
            <Text style={styles.profileValue}>
              {dealerProfile.address.street}, {dealerProfile.address.city},{' '}
              {dealerProfile.address.state} - {dealerProfile.address.postalCode}
            </Text>
          </View>

          {dealerProfile.gstin && (
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>GSTIN:</Text>
              <Text style={[styles.profileValue, { fontFamily: 'monospace' }]}>
                {dealerProfile.gstin}
              </Text>
            </View>
          )}

          {tierConfig && (
            <View style={styles.tierDescriptionBox}>
              <Text style={styles.tierDescTitle}>Territorial Coverage:</Text>
              <Text style={styles.tierDescBody}>{tierConfig.description}</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

import { useState } from 'react';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0A0F1D',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  centerSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#06b6d4',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  headerCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  portalTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#06b6d4',
    letterSpacing: 1,
    marginBottom: 4,
  },
  businessName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
  },
  dealerCodeBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  dealerCodeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38bdf8',
    fontFamily: 'monospace',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  tierText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusPillPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: {
    backgroundColor: '#10b981',
  },
  statusDotPending: {
    backgroundColor: '#f59e0b',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#34d399',
  },
  statusTextPending: {
    color: '#fbbf24',
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fbbf24',
    marginBottom: 4,
  },
  alertDesc: {
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 17,
    marginBottom: 6,
  },
  alertUid: {
    fontSize: 10,
    color: '#94a3b8',
  },
  pricingPolicyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  pricingPolicyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#06b6d4',
    marginBottom: 2,
  },
  pricingPolicyText: {
    fontSize: 11,
    color: '#cbd5e1',
    lineHeight: 16,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  actionsGrid: {
    gap: 10,
    marginBottom: 24,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    gap: 12,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 2,
  },
  actionCardDesc: {
    fontSize: 11,
    color: '#94a3b8',
    flex: 1,
  },
  profileBox: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  profileRow: {
    marginBottom: 10,
  },
  profileLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
  },
  profileValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8fafc',
  },
  tierDescriptionBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.1)',
  },
  tierDescTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#06b6d4',
    marginBottom: 2,
  },
  tierDescBody: {
    fontSize: 11,
    color: '#cbd5e1',
    lineHeight: 16,
  },
});
