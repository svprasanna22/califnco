import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { fetchCustomerOrders } from '../services/orderService';
import type { Order, OrderFulfillmentStatus, OrderPaymentStatus } from '../types/order';
import { formatINR } from '../types/product';
import { Badge } from '../components/common/Badge';

interface OrdersScreenProps {
  onRequireAuth: () => void;
  onBrowseProducts: () => void;
}

export function OrdersScreen({ onRequireAuth, onBrowseProducts }: OrdersScreenProps) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!user?.uid) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError(null);
    try {
      const data = await fetchCustomerOrders(user.uid);
      setOrders(data);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to fetch customer orders from Cloud Firestore.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const toggleExpand = (id: string) => {
    setExpandedOrderId((prev) => (prev === id ? null : id));
  };

  const getFulfillmentBadge = (status: OrderFulfillmentStatus) => {
    switch (status) {
      case 'installed':
        return <Badge label="Installed & Verified" variant="success" />;
      case 'out_for_installation':
        return <Badge label="Technician Assigned" variant="warning" />;
      case 'dispatched':
        return <Badge label="Dispatched" variant="cyan" />;
      case 'processing':
        return <Badge label="Processing" variant="cyan" />;
      case 'cancelled':
        return <Badge label="Cancelled" variant="danger" />;
      case 'pending':
      default:
        return <Badge label="Order Placed" variant="neutral" />;
    }
  };

  const getPaymentBadge = (status: OrderPaymentStatus) => {
    switch (status) {
      case 'paid':
        return <Badge label="PAID" variant="success" />;
      case 'cash_on_delivery':
        return <Badge label="COD" variant="warning" />;
      case 'failed':
        return <Badge label="FAILED" variant="danger" />;
      default:
        return <Badge label="PENDING" variant="neutral" />;
    }
  };

  const formatDate = (dateVal: any) => {
    if (!dateVal) return 'Recently';
    try {
      if (dateVal.toDate) return dateVal.toDate().toLocaleDateString('en-IN');
      return new Date(dateVal).toLocaleDateString('en-IN');
    } catch {
      return 'Recently';
    }
  };

  // Not signed in state
  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.iconCircle}>
          <Feather name="lock" size={36} color="#06b6d4" />
        </View>
        <Text style={styles.centerTitle}>Sign In to View Orders</Text>
        <Text style={styles.centerSubtitle}>
          Log in with your registered customer account to track your water purifier deliveries, technician installations, and TDS verification.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onRequireAuth} activeOpacity={0.8}>
          <Feather name="log-in" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>Sign In / Register</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>My Orders & Installations</Text>
        <Text style={styles.topBarSubtitle}>
          Account: {user.email}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />}
      >
        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#06b6d4" />
            <Text style={styles.loadingText}>Fetching orders from Cloud Firestore...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-triangle" size={24} color="#f87171" />
            <Text style={styles.errorTitle}>Orders Access Notice</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadOrders}>
              <Text style={styles.retryBtnText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={48} color="#64748b" />
            <Text style={styles.emptyTitle}>No Orders Yet</Text>
            <Text style={styles.emptyText}>
              You haven't placed any purifier orders under this customer account. Browse our certified smart RO and UV systems to get started.
            </Text>
            <TouchableOpacity style={styles.browseBtn} onPress={onBrowseProducts}>
              <Text style={styles.browseBtnText}>Browse Purifiers</Text>
            </TouchableOpacity>
          </View>
        ) : (
          orders.map((order) => {
            const isExpanded = expandedOrderId === order.id;

            return (
              <View key={order.id} style={styles.orderCard}>
                {/* Header */}
                <TouchableOpacity
                  style={styles.orderHeader}
                  onPress={() => toggleExpand(order.id)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.orderNumRow}>
                      <Text style={styles.orderNumber}>
                        {order.orderNumber || order.id.slice(0, 8)}
                      </Text>
                      {order.isTestOrder && (
                        <View style={styles.testBadge}>
                          <Text style={styles.testBadgeText}>TEST</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.orderDate}>Placed on {formatDate(order.createdAt)}</Text>
                  </View>

                  <View style={styles.headerRight}>
                    <Text style={styles.orderTotal}>
                      {formatINR(order.pricing?.totalAmount || 0)}
                    </Text>
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#94a3b8"
                    />
                  </View>
                </TouchableOpacity>

                {/* Status Badges Row */}
                <View style={styles.statusRow}>
                  <View style={styles.badgeItem}>
                    <Text style={styles.badgeCaption}>Fulfillment:</Text>
                    {getFulfillmentBadge(order.fulfillment.status)}
                  </View>
                  <View style={styles.badgeItem}>
                    <Text style={styles.badgeCaption}>Payment:</Text>
                    {getPaymentBadge(order.payment.status)}
                  </View>
                </View>

                {/* Items Summary (Always Visible) */}
                <View style={styles.itemsSummary}>
                  {order.items.map((item, idx) => (
                    <Text key={idx} style={styles.itemSummaryText} numberOfLines={1}>
                      • {item.quantity}x {item.name} ({formatINR(item.price)})
                    </Text>
                  ))}
                </View>

                {/* Expanded Details */}
                {isExpanded && (
                  <View style={styles.expandedContent}>
                    <View style={styles.divider} />

                    {/* Delivery Address */}
                    <Text style={styles.detailHeading}>Delivery Destination</Text>
                    <Text style={styles.addressText}>
                      {order.shippingAddress.street}, {order.shippingAddress.city},{' '}
                      {order.shippingAddress.state} - {order.shippingAddress.postalCode}
                    </Text>

                    {/* Assigned Technician if present */}
                    {order.fulfillment.assignedTechnician && (
                      <View style={styles.techBox}>
                        <Feather name="user-check" size={16} color="#06b6d4" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.techTitle}>Installation Technician</Text>
                          <Text style={styles.techDesc}>
                            {order.fulfillment.assignedTechnician.name} • {order.fulfillment.assignedTechnician.phone}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Certified TDS Handover Reading if installed */}
                    {order.fulfillment.status === 'installed' && order.fulfillment.tdsReading && (
                      <View style={styles.tdsBox}>
                        <MaterialCommunityIcons name="water-percent" size={18} color="#10b981" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.tdsTitle}>
                            Verified Handover TDS: {order.fulfillment.tdsReading} ppm
                          </Text>
                          {order.fulfillment.installationNotes && (
                            <Text style={styles.tdsDesc}>
                              Notes: {order.fulfillment.installationNotes}
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  topBar: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.1)',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  topBarSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
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
    backgroundColor: '#0284c7',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  centerLoading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 12,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginVertical: 16,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f87171',
    marginTop: 8,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  retryBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginVertical: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  browseBtn: {
    backgroundColor: '#06b6d4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  browseBtnText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  orderCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
    fontFamily: 'monospace',
  },
  testBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  testBadgeText: {
    color: '#fbbf24',
    fontSize: 9,
    fontWeight: '800',
  },
  orderDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#06b6d4',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 16,
    marginVertical: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.1)',
  },
  badgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeCaption: {
    fontSize: 11,
    color: '#94a3b8',
  },
  itemsSummary: {
    gap: 4,
  },
  itemSummaryText: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  expandedContent: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    marginBottom: 12,
  },
  detailHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 12,
    color: '#f8fafc',
    lineHeight: 18,
    marginBottom: 12,
  },
  techBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  techTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#06b6d4',
  },
  techDesc: {
    fontSize: 11,
    color: '#cbd5e1',
    marginTop: 1,
  },
  tdsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  tdsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10b981',
  },
  tdsDesc: {
    fontSize: 11,
    color: '#cbd5e1',
    marginTop: 1,
  },
});
