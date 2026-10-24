export type ProductCategory =
  | 'ro-purifiers'
  | 'uv-uf-purifiers'
  | 'cartridges'
  | 'spare-parts';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: ProductCategory;
  stock: number;
  imageUrl: string;
  isDemo?: boolean;
  imageType?: 'ai-generated' | 'technical-render' | 'studio-photography' | string;
  badge?: string;
  rating?: number;
  reviewCount?: number;
  features?: string[];
  specifications?: Record<string, string>;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
}

export interface CategoryInfo {
  id: ProductCategory | 'all';
  name: string;
  icon: string;
  tagline: string;
}

export const PRODUCT_CATEGORIES: CategoryInfo[] = [
  { id: 'all', name: 'All Products', icon: 'water', tagline: 'Complete purification range' },
  { id: 'ro-purifiers', name: 'Smart RO', icon: 'filter', tagline: 'Multi-stage RO + UV + Minerals' },
  { id: 'uv-uf-purifiers', name: 'UV + UF', icon: 'shield-check', tagline: 'Gravity and active UV systems' },
  { id: 'cartridges', name: 'Cartridges', icon: 'layers', tagline: 'Genuine sediment & carbon filters' },
  { id: 'spare-parts', name: 'Spare Parts', icon: 'tool', tagline: 'IoT sensors, taps & membranes' },
];

export function formatINR(amount: number): string {
  if (isNaN(amount)) return '₹0';
  return '₹' + amount.toLocaleString('en-IN');
}
