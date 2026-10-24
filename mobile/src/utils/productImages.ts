import type { ImageSourcePropType } from 'react-native';

export const DEFAULT_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&w=600&q=80';

// Statically map all 50 local demo product image assets for React Native bundler
const LOCAL_PRODUCT_IMAGES: Record<string, any> = {
  'product-01': require('../../assets/products/product-01.png'),
  'product-02': require('../../assets/products/product-02.png'),
  'product-03': require('../../assets/products/product-03.png'),
  'product-04': require('../../assets/products/product-04.png'),
  'product-05': require('../../assets/products/product-05.png'),
  'product-06': require('../../assets/products/product-06.png'),
  'product-07': require('../../assets/products/product-07.png'),
  'product-08': require('../../assets/products/product-08.png'),
  'product-09': require('../../assets/products/product-09.png'),
  'product-10': require('../../assets/products/product-10.png'),
  'product-11': require('../../assets/products/product-11.png'),
  'product-12': require('../../assets/products/product-12.png'),
  'product-13': require('../../assets/products/product-13.png'),
  'product-14': require('../../assets/products/product-14.png'),
  'product-15': require('../../assets/products/product-15.png'),
  'product-16': require('../../assets/products/product-16.png'),
  'product-17': require('../../assets/products/product-17.png'),
  'product-18': require('../../assets/products/product-18.png'),
  'product-19': require('../../assets/products/product-19.png'),
  'product-20': require('../../assets/products/product-20.png'),
  'product-21': require('../../assets/products/product-21.png'),
  'product-22': require('../../assets/products/product-22.png'),
  'product-23': require('../../assets/products/product-23.png'),
  'product-24': require('../../assets/products/product-24.png'),
  'product-25': require('../../assets/products/product-25.png'),
  'product-26': require('../../assets/products/product-26.png'),
  'product-27': require('../../assets/products/product-27.png'),
  'product-28': require('../../assets/products/product-28.png'),
  'product-29': require('../../assets/products/product-29.png'),
  'product-30': require('../../assets/products/product-30.png'),
  'product-31': require('../../assets/products/product-31.png'),
  'product-32': require('../../assets/products/product-32.png'),
  'product-33': require('../../assets/products/product-33.png'),
  'product-34': require('../../assets/products/product-34.png'),
  'product-35': require('../../assets/products/product-35.png'),
  'product-36': require('../../assets/products/product-36.png'),
  'product-37': require('../../assets/products/product-37.png'),
  'product-38': require('../../assets/products/product-38.png'),
  'product-39': require('../../assets/products/product-39.png'),
  'product-40': require('../../assets/products/product-40.png'),
  'product-41': require('../../assets/products/product-41.png'),
  'product-42': require('../../assets/products/product-42.png'),
  'product-43': require('../../assets/products/product-43.png'),
  'product-44': require('../../assets/products/product-44.png'),
  'product-45': require('../../assets/products/product-45.png'),
  'product-46': require('../../assets/products/product-46.png'),
  'product-47': require('../../assets/products/product-47.png'),
  'product-48': require('../../assets/products/product-48.png'),
  'product-49': require('../../assets/products/product-49.png'),
  'product-50': require('../../assets/products/product-50.png'),
};

/**
 * Resolves a product's imageUrl string to either a local bundled asset
 * or a remote network URI. Never returns broken or empty sources.
 */
export function resolveProductImage(imageUrl?: string | null): ImageSourcePropType {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return { uri: DEFAULT_PRODUCT_IMAGE };
  }

  // Check if string references one of our 50 demo product assets
  const match = imageUrl.match(/product-(\d{2})/i);
  if (match) {
    const key = `product-${match[1]}`;
    if (LOCAL_PRODUCT_IMAGES[key]) {
      return LOCAL_PRODUCT_IMAGES[key];
    }
  }

  // Standard web URL
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return { uri: imageUrl };
  }

  // Fallback
  return { uri: DEFAULT_PRODUCT_IMAGE };
}
