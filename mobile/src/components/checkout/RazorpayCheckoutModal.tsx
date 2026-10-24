import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { formatINR } from '../../types/product';
import {
  BACKEND_API_BASE_URL,
  type CreateRazorpayOrderResult,
} from '../../services/orderService';

// Safely inspect native Razorpay module availability without crashing in Expo Go
let NativeRazorpay: any = null;
try {
  const mod = require('react-native-razorpay');
  NativeRazorpay = mod.default || mod;
} catch {
  NativeRazorpay = null;
}

const isNativeSdkAvailable = !!(
  NativeRazorpay &&
  typeof NativeRazorpay.open === 'function'
);

export interface RazorpayPaymentSuccessData {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface RazorpayCheckoutModalProps {
  visible: boolean;
  orderData: CreateRazorpayOrderResult | null;
  customerName: string;
  customerPhone: string;
  isVerifying: boolean;
  verificationError: string | null;
  onClose: () => void;
  onPaymentSuccess: (paymentData: RazorpayPaymentSuccessData) => void;
  onPaymentFailure: (errorMessage: string) => void;
  onSwitchToCod?: () => void;
}

export function RazorpayCheckoutModal({
  visible,
  orderData,
  customerName,
  customerPhone,
  isVerifying,
  verificationError,
  onClose,
  onPaymentSuccess,
  onPaymentFailure,
  onSwitchToCod,
}: RazorpayCheckoutModalProps) {
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!orderData) return null;

  const totalInRupees = orderData.amountPaise / 100;

  // 1. Native Build Checkout (active only in custom dev client / standalone APK)
  const handleLaunchNativeSdk = () => {
    if (!isNativeSdkAvailable) return;

    NativeRazorpay.open({
      key: orderData.keyId,
      amount: orderData.amountPaise,
      name: 'Califnco Water Technologies',
      description: `Order ${orderData.orderNumber}`,
      order_id: orderData.razorpayOrderId,
      prefill: {
        name: customerName,
        contact: customerPhone,
      },
      theme: { color: '#0284c7' },
    })
      .then((data: any) => {
        onPaymentSuccess({
          orderId: orderData.orderId,
          razorpayOrderId: data.razorpay_order_id,
          razorpayPaymentId: data.razorpay_payment_id,
          razorpaySignature: data.razorpay_signature,
        });
      })
      .catch((err: any) => {
        onPaymentFailure(err?.description || err?.message || 'Payment cancelled by customer.');
      });
  };

  // 2. Open Official Razorpay Gateway in Phone Browser (supported in Expo Go)
  const handleOpenBrowserCheckout = async () => {
    setStatusMessage(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const checkoutUrl = `${BACKEND_API_BASE_URL}/api/payments/checkout-web?orderId=${encodeURIComponent(
        orderData.orderId
      )}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

      await Linking.openURL(checkoutUrl);
      setStatusMessage('Razorpay test checkout opened in browser. Complete the payment, then tap "Check Payment Status" below.');
    } catch (err: any) {
      setStatusMessage(`Unable to open browser: ${err?.message || 'Unknown error'}`);
    }
  };

  // 3. Check live payment status in Firestore (after browser completion)
  const handleCheckOrderStatus = async () => {
    setCheckingStatus(true);
    setStatusMessage(null);
    try {
      const orderRef = doc(db, 'orders', orderData.orderId);
      const snap = await getDoc(orderRef);

      if (snap.exists()) {
        const data = snap.data();
        if (data?.payment?.status === 'paid') {
          onPaymentSuccess({
            orderId: orderData.orderId,
            razorpayOrderId: data.payment.razorpayOrderId || orderData.razorpayOrderId,
            razorpayPaymentId: data.payment.transactionId || 'pay_verified',
            razorpaySignature: data.payment.razorpaySignature || 'sig_verified',
          });
          return;
        }
      }
      setStatusMessage('Payment has not yet been marked paid. If you completed payment in the browser, please allow 5 seconds for webhook verification and retry.');
    } catch (err: any) {
      setStatusMessage(`Error checking status: ${err?.message || 'Could not reach database'}`);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleCancel = () => {
    onPaymentFailure('Order payment cancelled by user.');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!isVerifying && !checkingStatus) onClose();
      }}
    >
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.razorpayLogoBadge}>
              <MaterialCommunityIcons name="lightning-bolt" size={18} color="#0284c7" />
              <Text style={styles.razorpayBrandText}>Razorpay</Text>
            </View>
            <View style={styles.testModeBadge}>
              <Text style={styles.testModeText}>TEST MODE</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleCancel}
            disabled={isVerifying || checkingStatus}
          >
            <Feather name="x" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Order Details Banner */}
          <View style={styles.orderSummaryCard}>
            <View style={styles.merchantRow}>
              <Text style={styles.merchantName}>Califnco Water Technologies</Text>
              <Text style={styles.amountText}>{formatINR(totalInRupees)}</Text>
            </View>
            <Text style={styles.merchantDesc}>Certified Water Purifier & Installation</Text>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Order Number:</Text>
              <Text style={styles.detailValue}>{orderData.orderNumber}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Razorpay Order ID:</Text>
              <Text style={[styles.detailValue, styles.monoText]}>{orderData.razorpayOrderId}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Public Key ID:</Text>
              <Text style={[styles.detailValue, styles.monoText]}>{orderData.keyId}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Customer:</Text>
              <Text style={styles.detailValue}>
                {customerName || 'Customer'} ({customerPhone || 'N/A'})
              </Text>
            </View>
          </View>

          {/* Honest Technical Environment Notice */}
          <View style={styles.expoNoticeCard}>
            <View style={styles.expoNoticeHeader}>
              <MaterialCommunityIcons name="information-outline" size={18} color="#38bdf8" />
              <Text style={styles.expoNoticeTitle}>Expo Environment & Architecture Note</Text>
            </View>
            <Text style={styles.expoNoticeBody}>
              • <Text style={styles.boldText}>Real Order Registered:</Text> A real pending order and official Razorpay order ({orderData.razorpayOrderId}) have been generated on the Render backend.
            </Text>
            <Text style={styles.expoNoticeBody}>
              • <Text style={styles.boldText}>Expo Go Limitation:</Text> The native <Text style={styles.monoTextInline}>react-native-razorpay</Text> library requires a custom native binary build (<Text style={styles.monoTextInline}>npx expo run:android</Text> or EAS Build) and cannot execute inside sandboxed Expo Go.
            </Text>
            <Text style={styles.expoNoticeBody}>
              • <Text style={styles.boldText}>Cryptographic Verification:</Text> Simulated or fake signatures are strictly rejected by the backend to maintain security.
            </Text>
          </View>

          {/* Verification Error Box */}
          {verificationError && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={18} color="#f87171" />
              <View style={{ flex: 1 }}>
                <Text style={styles.errorTitle}>Payment Verification Failed</Text>
                <Text style={styles.errorText}>{verificationError}</Text>
              </View>
            </View>
          )}

          {/* Status Message Box */}
          {statusMessage && (
            <View style={styles.statusBox}>
              <Feather name="info" size={16} color="#38bdf8" />
              <Text style={styles.statusText}>{statusMessage}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionContainer}>
            {/* If native SDK is linked (custom dev client / standalone APK) */}
            {isNativeSdkAvailable && (
              <TouchableOpacity
                style={[styles.paySuccessBtn, isVerifying && styles.btnDisabled]}
                onPress={handleLaunchNativeSdk}
                disabled={isVerifying}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="lightning-bolt" size={18} color="#fff" />
                <Text style={styles.payBtnText}>
                  Launch Native Razorpay Checkout ({formatINR(totalInRupees)})
                </Text>
              </TouchableOpacity>
            )}

            {/* Official Browser Checkout (Supported in Expo Go) */}
            <TouchableOpacity
              style={[styles.browserBtn, (isVerifying || checkingStatus) && styles.btnDisabled]}
              onPress={handleOpenBrowserCheckout}
              disabled={isVerifying || checkingStatus}
              activeOpacity={0.8}
            >
              <Feather name="external-link" size={16} color="#38bdf8" />
              <Text style={styles.browserBtnText}>
                Open Razorpay Test Gateway in Browser
              </Text>
            </TouchableOpacity>

            {/* Check Payment Status Button */}
            <TouchableOpacity
              style={[styles.checkStatusBtn, checkingStatus && styles.btnDisabled]}
              onPress={handleCheckOrderStatus}
              disabled={checkingStatus}
              activeOpacity={0.8}
            >
              {checkingStatus ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.checkStatusText}>Checking Payment Status...</Text>
                </>
              ) : (
                <>
                  <Feather name="refresh-cw" size={16} color="#fff" />
                  <Text style={styles.checkStatusText}>I Completed Payment (Check Status)</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Switch to Cash on Delivery (Instant Expo Go Checkout) */}
            {onSwitchToCod && (
              <TouchableOpacity
                style={styles.switchCodBtn}
                onPress={() => {
                  onClose();
                  onSwitchToCod();
                }}
                disabled={isVerifying}
                activeOpacity={0.8}
              >
                <Feather name="truck" size={16} color="#10b981" />
                <Text style={styles.switchCodBtnText}>
                  Switch to Cash on Delivery (Instant Order)
                </Text>
              </TouchableOpacity>
            )}

            {/* Cancel */}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancel}
              disabled={isVerifying || checkingStatus}
            >
              <Text style={styles.cancelBtnText}>Cancel Order & Return to Cart</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  razorpayLogoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  razorpayBrandText: {
    color: '#0284c7',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  testModeBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  testModeText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  closeBtn: {
    padding: 6,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  orderSummaryCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.15)',
    marginBottom: 16,
  },
  merchantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  merchantName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  amountText: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '800',
  },
  merchantDesc: {
    color: '#94a3b8',
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    marginVertical: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    color: '#64748b',
    fontSize: 12,
  },
  detailValue: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  monoText: {
    fontFamily: 'monospace',
    color: '#38bdf8',
    fontSize: 11,
  },
  expoNoticeCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    marginBottom: 16,
  },
  expoNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  expoNoticeTitle: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  expoNoticeBody: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  boldText: {
    color: '#e2e8f0',
    fontWeight: '700',
  },
  monoTextInline: {
    fontFamily: 'monospace',
    color: '#7dd3fc',
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: 16,
  },
  errorTitle: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
  },
  statusBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    marginBottom: 16,
  },
  statusText: {
    color: '#38bdf8',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  actionContainer: {
    gap: 12,
    marginTop: 8,
  },
  paySuccessBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  payBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  browserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  browserBtnText: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '700',
  },
  checkStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  checkStatusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  switchCodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  switchCodBtnText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
