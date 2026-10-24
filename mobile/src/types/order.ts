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
  uid?: string;
  name: string;
  email: string;
  phone: string;
}

export interface OrderShippingAddress {
  street: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
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

export interface Order {
  id: string;
  orderNumber: string;
  isTestOrder?: boolean;
  customer: OrderCustomer;
  shippingAddress: OrderShippingAddress;
  items: OrderLineItem[];
  pricing: {
    subtotal: number;
    tax: number;
    shipping: number;
    totalAmount: number;
  };
  payment: OrderPaymentInfo;
  fulfillment: OrderFulfillmentInfo;
  createdAt?: any;
  updatedAt?: any;
  updatedBy?: string;
}
