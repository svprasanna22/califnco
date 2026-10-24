import { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../types/product';
import {
  submitOrderToBackend,
  createRazorpayOrderBackend,
  verifyRazorpayPaymentBackend,
  reportPaymentFailureBackend,
  IS_BACKEND_DEPLOYED,
  type PlaceOrderResult,
  type CreateRazorpayOrderResult,
} from '../services/orderService';
import {
  RazorpayCheckoutModal,
  type RazorpayPaymentSuccessData,
} from '../components/checkout/RazorpayCheckoutModal';
import { resolveProductImage } from '../utils/productImages';

interface CartScreenProps {
  onContinueShopping: () => void;
  onRequireAuth: () => void;
  onOrderSuccess?: () => void;
}

export function CartScreen({
  onContinueShopping,
  onRequireAuth,
  onOrderSuccess,
}: CartScreenProps) {
  const {
    cartItems,
    updateQuantity,
    removeFromCart,
    clearCart,
    subtotal,
    tax,
    shipping,
    totalAmount,
  } = useCart();
  const { user, role, dealerProfile, isDealerActive } = useAuth();
  const isDealer = role === 'dealer';

  // Checkout Form State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('razorpay');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [state, setState] = useState('Karnataka');
  const [postalCode, setPostalCode] = useState('');

  // Processing & Feedback State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<PlaceOrderResult | null>(null);

  // Razorpay Test Checkout States
  const [showRazorpayModal, setShowRazorpayModal] = useState(false);
  const [razorpayOrderData, setRazorpayOrderData] = useState<CreateRazorpayOrderResult | null>(null);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [paidWithRazorpay, setPaidWithRazorpay] = useState(false);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);

  const handleOpenCheckout = () => {
    if (!user) {
      onRequireAuth();
      return;
    }

    if (isDealer) {
      if (!isDealerActive) {
        setCheckoutError('Dealer ordering is restricted. Your dealership profile is not active or approved.');
        setShowCheckoutModal(true);
        return;
      }

      // Prepopulate dealer address
      if (dealerProfile) {
        if (!fullName && dealerProfile.contactPerson) setFullName(dealerProfile.contactPerson);
        if (!phone && dealerProfile.phone) setPhone(dealerProfile.phone);
        if (!street && dealerProfile.address?.street) setStreet(dealerProfile.address.street);
        if (!city && dealerProfile.address?.city) setCity(dealerProfile.address.city);
        if (!state && dealerProfile.address?.state) setState(dealerProfile.address.state);
        if (!postalCode && dealerProfile.address?.postalCode) setPostalCode(dealerProfile.address.postalCode);
      }
    }

    setCheckoutError(null);
    setShowCheckoutModal(true);
  };

  const validateAddress = (): boolean => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      setCheckoutError('Please enter your full name for delivery.');
      return false;
    }
    const cleanPhone = phone.replace(/[\s\-()]/g, '');
    if (!/^(\+91)?[6-9]\d{9}$/.test(cleanPhone)) {
      setCheckoutError('Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).');
      return false;
    }
    if (!street.trim() || street.trim().length < 5) {
      setCheckoutError('Please enter a complete street address & house/flat number (min 5 characters).');
      return false;
    }
    if (!city.trim() || city.trim().length < 2) {
      setCheckoutError('Please specify your city.');
      return false;
    }
    if (!postalCode.trim() || !/^[1-9][0-9]{5}$/.test(postalCode.trim())) {
      setCheckoutError('Please enter a valid 6-digit Indian PIN code (e.g. 560001).');
      return false;
    }
    return true;
  };

  const handlePlaceOrder = async () => {
    setCheckoutError(null);
    if (!validateAddress()) return;

    setIsSubmitting(true);
    try {
      const result = await submitOrderToBackend({
        items: cartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        shippingAddress: {
          street: street.trim(),
          ...(landmark.trim() ? { landmark: landmark.trim() } : {}),
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
          country: 'India',
        },
        customerInfo: {
          name: fullName.trim(),
          phone: phone.trim(),
        },
        orderType: isDealer ? 'dealer' : 'customer',
      });

      // Clear shopping cart on successful server order creation
      clearCart();
      setPaidWithRazorpay(false);
      setLastPaymentId(null);
      setOrderSuccess(result);
    } catch (err: unknown) {
      console.error('COD Checkout Error:', err);
      const msg = err instanceof Error
        ? err.message
        : 'Failed to place Cash on Delivery order.';
      setCheckoutError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInitiateRazorpay = async () => {
    setCheckoutError(null);
    if (!validateAddress()) return;

    setIsSubmitting(true);
    try {
      const rzpOrder = await createRazorpayOrderBackend({
        items: cartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        shippingAddress: {
          street: street.trim(),
          ...(landmark.trim() ? { landmark: landmark.trim() } : {}),
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
          country: 'India',
        },
        customerInfo: {
          name: fullName.trim(),
          phone: phone.trim(),
        },
        orderType: isDealer ? 'dealer' : 'customer',
      });

      setRazorpayOrderData(rzpOrder);
      setShowRazorpayModal(true);
    } catch (err: unknown) {
      console.error('Razorpay Order Creation Error:', err);
      const msg = err instanceof Error
        ? err.message
        : 'Failed to initialize Razorpay test checkout.';
      setCheckoutError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRazorpaySuccess = async (paymentData: RazorpayPaymentSuccessData) => {
    setIsVerifyingPayment(true);
    setVerificationError(null);
    try {
      const verifyResult = await verifyRazorpayPaymentBackend(paymentData);
      clearCart();
      setShowRazorpayModal(false);
      setShowCheckoutModal(false);
      setPaidWithRazorpay(true);
      setLastPaymentId(paymentData.razorpayPaymentId);
      setOrderSuccess({
        success: true,
        orderId: verifyResult.orderId,
        orderNumber: verifyResult.orderNumber,
        totalAmount: verifyResult.amount || totalAmount,
        subtotal,
        tax,
        itemCount: cartItems.length,
      });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Payment signature verification failed.';
      setVerificationError(msg);
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  const handleRazorpayFailure = async (errorDesc: string) => {
    if (razorpayOrderData) {
      await reportPaymentFailureBackend(
        razorpayOrderData.orderId,
        razorpayOrderData.razorpayOrderId,
        errorDesc
      );
    }
    setShowRazorpayModal(false);
    setCheckoutError(
      'Payment was declined or cancelled. No order was confirmed and no inventory was reserved.'
    );
  };

  if (cartItems.length === 0 && !orderSuccess) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Feather name="shopping-bag" size={44} color="#64748b" />
        </View>
        <Text style={styles.emptyTitle}>Your Shopping Cart is Empty</Text>
        <Text style={styles.emptyDesc}>
          Explore Califnco certified water purifiers, UV filters, and replacement mineral cartridges.
        </Text>
        <TouchableOpacity
          style={styles.browseBtn}
          onPress={onContinueShopping}
          activeOpacity={0.8}
        >
          <Feather name="grid" size={16} color="#0f172a" />
          <Text style={styles.browseBtnText}>Explore Purifiers</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Bar with Clear Cart */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>
          {isDealer ? 'Dealer Wholesale Cart' : 'Shopping Cart'} ({cartItems.length})
        </Text>
        <TouchableOpacity onPress={clearCart}>
          <Text style={styles.clearText}>Clear All</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Cart Item Cards */}
        {cartItems.map((item) => (
          <View key={item.product.id} style={styles.itemCard}>
            <Image
              source={resolveProductImage(item.product.imageUrl)}
              style={styles.itemImage}
              resizeMode="cover"
            />
            <View style={styles.itemDetails}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {item.product.isDemo && (
                  <View style={{ backgroundColor: 'rgba(168, 85, 247, 0.18)', borderColor: '#A855F7', borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                    <Text style={{ color: '#C084FC', fontSize: 9, fontWeight: '700' }}>DEMO</Text>
                  </View>
                )}
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.product.name}
                </Text>
              </View>
              <Text style={styles.itemPrice}>
                {formatINR(item.product.price)}
              </Text>

              {/* Quantity Controls & Delete */}
              <View style={styles.itemControls}>
                <View style={styles.qtyBox}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.product.id, item.quantity - 1)}
                  >
                    <Feather name="minus" size={14} color="#94a3b8" />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.product.id, item.quantity + 1)}
                  >
                    <Feather name="plus" size={14} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeFromCart(item.product.id)}
                >
                  <Feather name="trash-2" size={16} color="#f87171" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        {/* Delivery / Freight Banner */}
        <View style={styles.deliveryBadge}>
          <Feather name="truck" size={18} color="#06b6d4" />
          <View style={{ flex: 1 }}>
            <Text style={styles.deliveryTitle}>
              {isDealer
                ? 'Complimentary Dealer Freight Dispatch'
                : 'Complimentary White-Glove Delivery'}
            </Text>
            <Text style={styles.deliveryDesc}>
              {isDealer
                ? 'Priority bulk dispatch directly to your authorized dealership warehouse.'
                : 'Includes doorstep technician unboxing & installation.'}
            </Text>
          </View>
        </View>

        {/* Security & Backend Availability Notice */}
        <View style={styles.securityNoteCard}>
          <MaterialCommunityIcons name="shield-lock-outline" size={18} color="#06b6d4" />
          <Text style={styles.securityNoteText}>
            Connected to Califnco Backend. Prices, inventory reservations & payments are verified authoritatively.
          </Text>
        </View>

        {/* Price Breakdown */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Estimated Price Breakdown</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatINR(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Estimated GST (18%)</Text>
            <Text style={styles.summaryValue}>{formatINR(tax)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Technician Delivery</Text>
            <Text style={[styles.summaryValue, { color: '#10b981' }]}>FREE</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total Payable</Text>
            <Text style={styles.totalValue}>{formatINR(totalAmount)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Checkout Footer */}
      <View style={styles.bottomFooter}>
        <View>
          <Text style={styles.footerPriceLabel}>Total Amount</Text>
          <Text style={styles.footerPrice}>{formatINR(totalAmount)}</Text>
        </View>
        <TouchableOpacity
          style={styles.checkoutBtn}
          onPress={handleOpenCheckout}
          activeOpacity={0.8}
        >
          <Text style={styles.checkoutBtnText}>Proceed to Checkout</Text>
          <Feather name="arrow-right" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Delivery Details & Checkout Modal */}
      <Modal
        visible={showCheckoutModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!isSubmitting) setShowCheckoutModal(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Delivery & Payment</Text>
              <Text style={styles.modalSubtitle}>Cash on Delivery • White-Glove Installation</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowCheckoutModal(false)}
              disabled={isSubmitting}
            >
              <Feather name="x" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll}>

            {/* Error Banner */}
            {checkoutError && (
              <View style={styles.errorBox}>
                <Feather name="alert-triangle" size={16} color="#f87171" />
                <Text style={styles.errorText}>{checkoutError}</Text>
              </View>
            )}

            {/* Recipient Information */}
            <Text style={styles.sectionHeader}>Recipient Information</Text>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor="#64748b"
                value={fullName}
                onChangeText={setFullName}
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Mobile Phone (for technician dispatch) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 9876543210"
                placeholderTextColor="#64748b"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                editable={!isSubmitting}
              />
            </View>

            {/* Shipping Address */}
            <Text style={styles.sectionHeader}>Installation Address</Text>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Flat / House / Street Address *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Flat 302, Green Glen Apartments, Outer Ring Road"
                placeholderTextColor="#64748b"
                value={street}
                onChangeText={setStreet}
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Landmark (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Near HDFC Bank, Bellandur"
                placeholderTextColor="#64748b"
                value={landmark}
                onChangeText={setLandmark}
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>City *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Bengaluru"
                  placeholderTextColor="#64748b"
                  value={city}
                  onChangeText={setCity}
                  editable={!isSubmitting}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>PIN Code (6 digits) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="560103"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                  maxLength={6}
                  value={postalCode}
                  onChangeText={setPostalCode}
                  editable={!isSubmitting}
                />
              </View>
            </View>

            {/* Payment Method Selector */}
            <Text style={styles.sectionHeader}>Select Payment Method</Text>

            {/* Option 1: Razorpay Online (Test Mode) */}
            <TouchableOpacity
              style={[
                styles.paymentOptionCard,
                paymentMethod === 'razorpay' && styles.paymentOptionCardActive,
              ]}
              onPress={() => setPaymentMethod('razorpay')}
              activeOpacity={0.8}
            >
              <View style={styles.paymentRadio}>
                {paymentMethod === 'razorpay' && <View style={styles.paymentRadioInner} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.paymentOptionHeader}>
                  <Text style={styles.paymentOptionTitle}>Razorpay Online</Text>
                  <View style={styles.testBadgeContainer}>
                    <Text style={styles.testBadgeText}>TEST MODE</Text>
                  </View>
                </View>
                <Text style={styles.paymentOptionDesc}>
                  Cards, UPI, Netbanking. Secure test checkout via Render Node.js backend with cryptographic HMAC-SHA256 verification.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Option 2: Cash on Delivery (COD) */}
            <TouchableOpacity
              style={[
                styles.paymentOptionCard,
                paymentMethod === 'cod' && styles.paymentOptionCardActive,
              ]}
              onPress={() => setPaymentMethod('cod')}
              activeOpacity={0.8}
            >
              <View style={styles.paymentRadio}>
                {paymentMethod === 'cod' && <View style={styles.paymentRadioInner} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.paymentOptionHeader}>
                  <Text style={styles.paymentOptionTitle}>Cash on Delivery (COD)</Text>
                  <View style={styles.codBadgeContainer}>
                    <Text style={styles.codBadgeText}>PAY ON SETUP</Text>
                  </View>
                </View>
                <Text style={styles.paymentOptionDesc}>
                  Zero upfront payment. Pay the certified Califnco field technician in cash only after unboxing, mounting, and TDS verification.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Price Confirmation */}
            <View style={styles.modalPriceSummary}>
              <Text style={styles.modalSummaryText}>
                {paymentMethod === 'razorpay' ? 'Total Payable Online: ' : 'Total Payable on Installation: '}
                <Text style={styles.modalSummaryHighlight}>{formatINR(totalAmount)}</Text>
              </Text>
            </View>

            {/* Submit CTA */}
            {paymentMethod === 'razorpay' ? (
              <TouchableOpacity
                style={[styles.confirmBtn, styles.razorpayBtn, isSubmitting && styles.confirmBtnDisabled]}
                onPress={handleInitiateRazorpay}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.confirmBtnText}>Creating Razorpay Order...</Text>
                  </>
                ) : (
                  <>
                    <MaterialCommunityIcons name="lightning-bolt" size={18} color="#fff" />
                    <Text style={styles.confirmBtnText}>Proceed to Razorpay Test Checkout</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.confirmBtn, isSubmitting && styles.confirmBtnDisabled]}
                onPress={handlePlaceOrder}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.confirmBtnText}>Validating & Reserving Stock...</Text>
                  </>
                ) : (
                  <>
                    <Feather name="check-circle" size={18} color="#fff" />
                    <Text style={styles.confirmBtnText}>Confirm Cash on Delivery Order</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Razorpay Test Checkout Modal */}
      <RazorpayCheckoutModal
        visible={showRazorpayModal}
        orderData={razorpayOrderData}
        customerName={fullName}
        customerPhone={phone}
        isVerifying={isVerifyingPayment}
        verificationError={verificationError}
        onClose={() => {
          if (!isVerifyingPayment) setShowRazorpayModal(false);
        }}
        onPaymentSuccess={handleRazorpaySuccess}
        onPaymentFailure={handleRazorpayFailure}
        onSwitchToCod={() => {
          setPaymentMethod('cod');
          setShowCheckoutModal(true);
        }}
      />

      {/* Order Success Screen / Modal */}
      <Modal
        visible={!!orderSuccess}
        animationType="fade"
        transparent
        onRequestClose={() => setOrderSuccess(null)}
      >
        <View style={styles.successBackdrop}>
          <View style={styles.successContent}>
            <View style={styles.successIconCircle}>
              <Feather name="check" size={36} color="#10b981" />
            </View>

            <Text style={styles.successTitle}>
              {paidWithRazorpay ? 'Payment Verified & Confirmed!' : 'Order Confirmed!'}
            </Text>
            <Text style={styles.successSubtitle}>
              {paidWithRazorpay
                ? 'Your Razorpay test payment was cryptographically verified by the secure Califnco Render backend.'
                : 'Your cash-on-delivery order has been received and verified by the Califnco backend.'}
            </Text>

            <View style={styles.successDetailsBox}>
              <View style={styles.successDetailRow}>
                <Text style={styles.successDetailLabel}>Order Reference:</Text>
                <Text style={styles.successDetailValue}>{orderSuccess?.orderNumber}</Text>
              </View>
              <View style={styles.successDetailRow}>
                <Text style={styles.successDetailLabel}>Payment Method:</Text>
                <Text
                  style={[
                    styles.successDetailValue,
                    { color: paidWithRazorpay ? '#10b981' : '#fbbf24' },
                  ]}
                >
                  {paidWithRazorpay ? 'Razorpay Online (PAID)' : 'Cash on Delivery (Pending)'}
                </Text>
              </View>
              {lastPaymentId && (
                <View style={styles.successDetailRow}>
                  <Text style={styles.successDetailLabel}>Payment ID:</Text>
                  <Text style={[styles.successDetailValue, { color: '#06b6d4', fontSize: 11 }]}>
                    {lastPaymentId}
                  </Text>
                </View>
              )}
              <View style={styles.successDetailRow}>
                <Text style={styles.successDetailLabel}>Total Amount:</Text>
                <Text style={styles.successDetailValue}>
                  {formatINR(orderSuccess?.totalAmount || 0)}
                </Text>
              </View>
              <View style={styles.successDetailRow}>
                <Text style={styles.successDetailLabel}>Installation:</Text>
                <Text style={[styles.successDetailValue, { color: '#06b6d4' }]}>Free Doorstep Setup</Text>
              </View>
            </View>

            <Text style={styles.handoverNotice}>
              A certified technician will contact your mobile number to schedule unboxing and water quality TDS calibration.
            </Text>

            <View style={styles.successActionButtons}>
              <TouchableOpacity
                style={styles.viewOrdersBtn}
                onPress={() => {
                  setOrderSuccess(null);
                  setShowCheckoutModal(false);
                  if (onOrderSuccess) onOrderSuccess();
                }}
              >
                <Feather name="clipboard" size={16} color="#fff" />
                <Text style={styles.viewOrdersBtnText}>Track in My Orders</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.continueShopBtn}
                onPress={() => {
                  setOrderSuccess(null);
                  setShowCheckoutModal(false);
                  onContinueShopping();
                }}
              >
                <Text style={styles.continueShopBtnText}>Continue Shopping</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.1)',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  clearText: {
    fontSize: 13,
    color: '#f87171',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    gap: 12,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#0f172a',
  },
  itemDetails: {
    flex: 1,
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#06b6d4',
  },
  itemControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 10,
  },
  qtyBtn: {
    padding: 4,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
    minWidth: 18,
    textAlign: 'center',
  },
  removeBtn: {
    padding: 6,
  },
  deliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  deliveryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#06b6d4',
  },
  deliveryDesc: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  sparkPlanBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  sparkPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sparkPlanTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fbbf24',
  },
  sparkPlanMessage: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  sparkPlanDesc: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 16,
  },
  modalNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  modalNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fbbf24',
    marginBottom: 2,
  },
  modalNoticeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f8fafc',
    lineHeight: 16,
  },
  modalNoticeSubtext: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  securityNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.1)',
  },
  securityNoteText: {
    fontSize: 11,
    color: '#94a3b8',
    flex: 1,
  },
  summaryCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8fafc',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    marginVertical: 10,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#06b6d4',
  },
  bottomFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.15)',
  },
  footerPriceLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  footerPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: '#06b6d4',
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0284c7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  checkoutBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#0A0F1D',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#06b6d4',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  browseBtnText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#06b6d4',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#06b6d4',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 14,
  },
  formGroup: {
    marginBottom: 14,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  paymentOptionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    gap: 12,
    marginBottom: 12,
  },
  paymentOptionCardActive: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    borderColor: '#0284c7',
  },
  paymentRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  paymentRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0284c7',
  },
  paymentOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  paymentOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  testBadgeContainer: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  testBadgeText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  codBadgeContainer: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  codBadgeText: {
    color: '#06b6d4',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  paymentOptionDesc: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 16,
  },
  razorpayBtn: {
    backgroundColor: '#0284c7',
  },
  codCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    gap: 12,
    marginBottom: 20,
  },
  codRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#06b6d4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  codRadioActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#06b6d4',
  },
  codTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  codDesc: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 17,
  },
  modalPriceSummary: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    alignItems: 'center',
  },
  modalSummaryText: {
    fontSize: 13,
    color: '#cbd5e1',
  },
  modalSummaryHighlight: {
    fontSize: 16,
    fontWeight: '800',
    color: '#06b6d4',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 14,
  },
  confirmBtnDisabled: {
    backgroundColor: '#334155',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 15,
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
  successBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  successContent: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    alignItems: 'center',
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 20,
  },
  successDetailsBox: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  successDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  successDetailLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  successDetailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
    fontFamily: 'monospace',
  },
  handoverNotice: {
    fontSize: 11,
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 20,
  },
  successActionButtons: {
    width: '100%',
    gap: 10,
  },
  viewOrdersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#06b6d4',
    borderRadius: 10,
    paddingVertical: 12,
  },
  viewOrdersBtnText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  continueShopBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  continueShopBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
});
