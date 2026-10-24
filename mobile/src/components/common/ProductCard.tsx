import { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Product } from '../../types/product';
import { formatINR } from '../../types/product';
import { Badge } from './Badge';
import { resolveProductImage } from '../../utils/productImages';

interface ProductCardProps {
  product: Product;
  onPress: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

export function ProductCard({ product, onPress, onAddToCart }: ProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const isOutOfStock = Number(product.stock) <= 0;
  const isLowStock = Number(product.stock) > 0 && Number(product.stock) <= 3;
  const isDemo = Boolean(product.isDemo || product.id.startsWith('demo-prod-'));

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'ro-purifiers':
        return 'Smart RO';
      case 'uv-uf-purifiers':
        return 'UV + UF';
      case 'cartridges':
        return 'Cartridge';
      case 'spare-parts':
        return 'Spare Part';
      default:
        return category;
    }
  };

  const imageSource = imageError
    ? resolveProductImage(null)
    : resolveProductImage(product.imageUrl);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.88}
      onPress={() => onPress(product)}
    >
      {/* Product Image Container */}
      <View style={styles.imageContainer}>
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />

        {/* Top Badges Overlay */}
        <View style={styles.badgeOverlay}>
          <Badge label={getCategoryLabel(product.category)} variant="cyan" size="sm" />
          {product.badge && (
            <View style={styles.customBadge}>
              <Text style={styles.customBadgeText}>{product.badge}</Text>
            </View>
          )}
        </View>

        {/* Demo Indicator Tag */}
        {isDemo && (
          <View style={styles.demoTag}>
            <Text style={styles.demoTagText}>DEMO</Text>
          </View>
        )}
      </View>

      {/* Card Body */}
      <View style={styles.body}>
        {/* Rating and Stock Row */}
        <View style={styles.metaRow}>
          <View style={styles.ratingBox}>
            <MaterialCommunityIcons name="star" size={14} color="#fbbf24" />
            <Text style={styles.ratingText}>
              {product.rating ? product.rating.toFixed(1) : '4.8'}
            </Text>
            <Text style={styles.reviewCountText}>
              ({product.reviewCount || 48})
            </Text>
          </View>

          {isOutOfStock ? (
            <Badge label="Out of Stock" variant="danger" size="sm" />
          ) : isLowStock ? (
            <Badge label={`Only ${product.stock} Left`} variant="warning" size="sm" />
          ) : (
            <Badge label="In Stock" variant="success" size="sm" />
          )}
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {product.name}
        </Text>

        {/* Technical Highlights Snippet */}
        {product.features && product.features.length > 0 && (
          <Text style={styles.featureSnippet} numberOfLines={1}>
            • {product.features[0]}
          </Text>
        )}

        {/* Price & Action Row */}
        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.priceLabel}>Price (incl. 18% GST)</Text>
            <Text style={styles.price}>{formatINR(product.price)}</Text>
          </View>

          <TouchableOpacity
            style={[styles.addBtn, isOutOfStock && styles.addBtnDisabled]}
            disabled={isOutOfStock}
            onPress={(e) => {
              onAddToCart(product);
            }}
            activeOpacity={0.7}
          >
            <Feather name="shopping-bag" size={15} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.15)',
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  imageContainer: {
    width: '100%',
    height: 190,
    backgroundColor: '#1e293b',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badgeOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  customBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  customBadgeText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  demoTag: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(14, 165, 233, 0.9)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  demoTagText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  body: {
    padding: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  reviewCountText: {
    color: '#64748b',
    fontSize: 11,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    lineHeight: 21,
    marginBottom: 6,
  },
  featureSnippet: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 12,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.12)',
  },
  priceLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
  },
  price: {
    fontSize: 18,
    fontWeight: '800',
    color: '#38bdf8',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  addBtnDisabled: {
    backgroundColor: '#334155',
    shadowOpacity: 0,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
