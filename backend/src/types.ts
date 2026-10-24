export type OrderFulfillmentStatus =
  | 'pending'
  | 'processing'
  | 'dispatched'
  | 'out_for_installation'
  | 'installed'
  | 'cancelled';

export type OrderPaymentStatus =
  | 'pending'
  | 'paid'
  | 'cash_on_delivery'
  | 'failed'
  | 'refunded';

export type PaymentMethod =
  | 'razorpay'
  | 'stripe'
  | 'upi'
  | 'net_banking'
  | 'cash_on_delivery';

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface ShippingAddressInput {
  street: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export interface CustomerInfoInput {
  name?: string;
  phone?: string;
}

export interface CreateRazorpayOrderRequest {
  items: OrderItemInput[];
  shippingAddress: ShippingAddressInput;
  customerInfo?: CustomerInfoInput;
  orderType?: 'customer' | 'dealer';
}

export interface VerifyPaymentRequest {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface PaymentFailureRequest {
  orderId: string;
  razorpayOrderId?: string;
  errorCode?: string;
  errorDescription?: string;
}

export interface ProductCatalogRecord {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  imageUrl?: string;
}

export interface OrderLineItem {
  productId: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  total: number;
  imageUrl?: string;
}

export interface OrderCustomer {
  uid: string;
  name: string;
  email: string;
  phone: string;
}

export interface OrderDealerInfo {
  id: string;
  dealerCode: string;
  businessName: string;
  tier: string;
}

export interface OrderPricing {
  subtotal: number;
  tax: number;
  shipping: number;
  totalAmount: number;
}

export interface OrderPaymentInfo {
  status: OrderPaymentStatus;
  method: PaymentMethod;
  transactionId: string | null;
  paidAt?: any;
  collectedByTechnician?: boolean;
  collectedAmount?: number;
  collectedAt?: any;
  notes?: string;
  isTestMode?: boolean;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
}

export interface OrderFulfillmentInfo {
  status: OrderFulfillmentStatus;
  carrier?: string | null;
  trackingNumber?: string | null;
  assignedTechnician?: {
    id?: string;
    name: string;
    phone: string;
  } | null;
  installedAt?: any;
  tdsReading?: number | null;
  installationNotes?: string | null;
  cancellationReason?: string | null;
  notes?: string | null;
}

export interface OrderDocument {
  orderNumber: string;
  isTestOrder: boolean;
  orderType?: 'customer' | 'dealer';
  dealer?: OrderDealerInfo;
  customer: OrderCustomer;
  shippingAddress: ShippingAddressInput;
  items: OrderLineItem[];
  pricing: OrderPricing;
  payment: OrderPaymentInfo;
  fulfillment: OrderFulfillmentInfo;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
}
