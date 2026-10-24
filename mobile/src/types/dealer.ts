export type DealerStatus = 'pending' | 'active' | 'suspended';

export type DealerTier =
  | 'diamond'
  | 'gold'
  | 'silver'
  | 'regional_hub'
  | 'service_partner';

export interface DealerAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface Dealer {
  id: string;
  dealerCode: string;
  businessName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: DealerAddress;
  gstin?: string | null;
  tier: DealerTier;
  status: DealerStatus;
  installedBaseCount?: number;
  notes?: string | null;
  userId?: string | null;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
}

export const DEALER_TIER_CONFIG: Record<
  DealerTier,
  { label: string; badgeColor: string; description: string }
> = {
  diamond: {
    label: 'Diamond Distributor',
    badgeColor: '#06b6d4',
    description: 'High-volume tier with regional territory exclusivity',
  },
  gold: {
    label: 'Gold Partner',
    badgeColor: '#fbbf24',
    description: 'City-level distributor and primary stockist',
  },
  silver: {
    label: 'Silver Partner',
    badgeColor: '#94a3b8',
    description: 'Town or zonal certified retailer and installer',
  },
  regional_hub: {
    label: 'Regional Hub',
    badgeColor: '#34d399',
    description: 'Central parts depot and fulfillment center',
  },
  service_partner: {
    label: 'Authorized Service Center',
    badgeColor: '#38bdf8',
    description: 'Certified water quality testing and technician dispatch partner',
  },
};
