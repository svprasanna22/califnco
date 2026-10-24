import { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Product } from '../types/product';
import { formatINR } from '../types/product';
import { Badge } from '../components/common/Badge';
import { useCart } from '../context/CartContext';
import { resolveProductImage } from '../utils/productImages';

interface ProductDetailScreenProps {
  product: Product;
  onBack: () => void;
  onGoToCart: () => void;
}

export function ProductDetailScreen({
  product,
  onBack,
  onGoToCart,
}: ProductDetailScreenProps) {
  const { addToCart, totalItemsCount } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [addedToast, setAddedToast] = useState(false);

  const isOutOfStock = Number(product.stock) <= 0;
  const isLowStock = Number(product.stock) > 0 && Number(product.stock) <= 3;
  const rating = product.rating || 4.8;
  const reviewCount = product.reviewCount || 142;

  const handleAddToCart = () => {
    addToCart(product, quantity);
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 3500);
  };

  const incrementQty = () => {
    if (quantity < Number(product.stock)) {
      setQuantity((q) => q + 1);
    }
  };

  const decrementQty = () => {
    if (quantity > 1) {
      setQuantity((q) => q - 1);
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'ro-purifiers':
        return 'Multi-Stage Smart RO';
      case 'uv-uf-purifiers':
        return 'UV + UF Micro-Filtration';
      case 'cartridges':
        return 'Replacement Filter Cartridge';
      case 'spare-parts':
        return 'Genuine Spare & Sensor';
      default:
        return category;
    }
  };

  const specs = product.specifications || {};
  const specEntries = Object.entries(specs);

  return (
    <View style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.navIconBtn} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {product.name}
        </Text>
        <TouchableOpacity style={styles.navIconBtn} onPress={onGoToCart} activeOpacity={0.7}>
          <Feather name="shopping-bag" size={19} color="#00C2CB" />
          {totalItemsCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{totalItemsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Main Image Showcase */}
        <View style={styles.imageShowcase}>
          <Image
            source={resolveProductImage(product.imageUrl)}
            style={styles.image}
            resizeMode="cover"
          />
          {/* Ambient Lighting Gradient / Badges on Image */}
          <View style={styles.imageOverlayBadges}>
            {product.isDemo && (
              <View style={styles.demoBadge}>
                <Feather name="layers" size={12} color="#C084FC" />
                <Text style={styles.demoBadgeText}>DEMO SPECIMEN</Text>
              </View>
            )}
            {product.imageType === 'ai-generated' && (
              <View style={styles.aiBadge}>
                <Feather name="cpu" size={12} color="#00E5FF" />
                <Text style={styles.aiBadgeText}>AI STUDIO RENDER</Text>
              </View>
            )}
          </View>
        </View>

        {/* Content Details */}
        <View style={styles.detailsContainer}>
          {/* Category & Stock Badges */}
          <View style={styles.badgeRow}>
            <Badge label={getCategoryLabel(product.category)} variant="cyan" size="md" />
            {isOutOfStock ? (
              <Badge label="Out of Stock" variant="danger" size="md" />
            ) : isLowStock ? (
              <Badge label={`Only ${product.stock} Units Left`} variant="warning" size="md" />
            ) : (
              <Badge label="In Stock & Ready to Ship" variant="success" size="md" />
            )}
            {product.badge && (
              <View style={styles.highlightBadge}>
                <Text style={styles.highlightBadgeText}>{product.badge}</Text>
              </View>
            )}
          </View>

          {/* Product Title */}
          <Text style={styles.title}>{product.name}</Text>

          {/* Rating & Review Counter */}
          <View style={styles.ratingRow}>
            <View style={styles.stars}>
              {[...Array(5)].map((_, i) => (
                <Feather
                  key={i}
                  name="star"
                  size={14}
                  color={i < Math.floor(rating) ? '#FBBF24' : '#475569'}
                  style={{ marginRight: 2 }}
                />
              ))}
            </View>
            <Text style={styles.ratingScore}>{rating.toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({reviewCount} verified installations)</Text>
          </View>

          {/* Price Box */}
          <View style={styles.priceContainer}>
            <View>
              <Text style={styles.priceLabel}>All-inclusive price with 18% GST</Text>
              <Text style={styles.price}>{formatINR(product.price)}</Text>
            </View>
            <View style={styles.freeInstallTag}>
              <MaterialCommunityIcons name="wrench-clock" size={16} color="#00C2CB" />
              <View>
                <Text style={styles.freeInstallText}>Free Installation</Text>
                <Text style={styles.freeInstallSub}>TDS Handover Protocol</Text>
              </View>
            </View>
          </View>

          {/* Overview Description */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>System Overview</Text>
            <Text style={styles.description}>
              {product.description ||
                'Engineered with commercial-grade membranes and precision mineralization stages for immaculate drinking water purity.'}
            </Text>
          </View>

          {/* Key Features List (if available) */}
          {product.features && product.features.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeader}>Key Engineering Highlights</Text>
              <View style={styles.featuresList}>
                {product.features.map((feat, idx) => (
                  <View key={idx} style={styles.featureItem}>
                    <View style={styles.featureIcon}>
                      <Feather name="check" size={13} color="#00C2CB" />
                    </View>
                    <Text style={styles.featureText}>{feat}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Technical Specifications Table (if available) */}
          {specEntries.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeader}>Technical Specifications</Text>
              <View style={styles.specTable}>
                {specEntries.map(([label, val], idx) => (
                  <View
                    key={label}
                    style={[
                      styles.specRow,
                      idx % 2 === 1 && styles.specRowAlt,
                      idx === specEntries.length - 1 && styles.specRowLast,
                    ]}
                  >
                    <Text style={styles.specKey}>{label}</Text>
                    <Text style={styles.specVal}>{val}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Califnco 3-Pillar Assurance */}
          <View style={styles.assuranceBox}>
            <Text style={styles.assuranceHeader}>Califnco Purity Assurance</Text>
            <View style={styles.assuranceItem}>
              <Feather name="shield" size={18} color="#00C2CB" />
              <View style={styles.assuranceTextCol}>
                <Text style={styles.assuranceTitle}>1-Year Comprehensive Warranty</Text>
                <Text style={styles.assuranceDesc}>
                  Complete coverage for electrical booster pump, SMPS adapter, and reverse osmosis membrane.
                </Text>
              </View>
            </View>

            <View style={styles.assuranceItem}>
              <MaterialCommunityIcons name="water-check" size={20} color="#00C2CB" />
              <View style={styles.assuranceTextCol}>
                <Text style={styles.assuranceTitle}>Calibrated TDS Water Handover</Text>
                <Text style={styles.assuranceDesc}>
                  Certified technician measures and logs both input and purified TDS on digital certificate before departure.
                </Text>
              </View>
            </View>

            <View style={styles.assuranceItem}>
              <Feather name="truck" size={18} color="#00C2CB" />
              <View style={styles.assuranceTextCol}>
                <Text style={styles.assuranceTitle}>Tamper-Proof Doorstep Unboxing</Text>
                <Text style={styles.assuranceDesc}>
                  Dispatched in sealed containers with verified Califnco holographic authenticity seals.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Bottom Action Bar */}
      <View style={styles.bottomBar}>
        {/* Quantity Controls */}
        <View style={styles.qtyContainer}>
          <TouchableOpacity
            style={[styles.qtyBtn, (quantity <= 1 || isOutOfStock) && styles.qtyBtnDisabled]}
            onPress={decrementQty}
            disabled={quantity <= 1 || isOutOfStock}
          >
            <Feather name="minus" size={15} color={quantity <= 1 || isOutOfStock ? '#475569' : '#F8FAFC'} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{quantity}</Text>
          <TouchableOpacity
            style={[styles.qtyBtn, (quantity >= Number(product.stock) || isOutOfStock) && styles.qtyBtnDisabled]}
            onPress={incrementQty}
            disabled={quantity >= Number(product.stock) || isOutOfStock}
          >
            <Feather name="plus" size={15} color={quantity >= Number(product.stock) || isOutOfStock ? '#475569' : '#F8FAFC'} />
          </TouchableOpacity>
        </View>

        {/* Add to Cart CTA */}
        <TouchableOpacity
          style={[styles.ctaBtn, isOutOfStock && styles.ctaBtnDisabled]}
          onPress={handleAddToCart}
          disabled={isOutOfStock}
          activeOpacity={0.8}
        >
          <Feather name="shopping-bag" size={18} color="#0A1128" />
          <Text style={styles.ctaBtnText}>
            {isOutOfStock ? 'Sold Out' : `Add to Cart • ${formatINR(product.price * quantity)}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Added Toast */}
      {addedToast && (
        <View style={styles.floatingToast}>
          <Feather name="check-circle" size={18} color="#00E5FF" />
          <Text style={styles.floatingToastText}>Added to cart! Tap bag icon above to checkout.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0F1A3A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 194, 203, 0.15)',
  },
  navIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#16234D',
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 203, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  topBarTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  imageShowcase: {
    width: '100%',
    height: 300,
    backgroundColor: '#070C1E',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageOverlayBadges: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    gap: 8,
  },
  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 26, 58, 0.9)',
    borderWidth: 1,
    borderColor: '#A855F7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  demoBadgeText: {
    color: '#C084FC',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 26, 58, 0.9)',
    borderWidth: 1,
    borderColor: '#00C2CB',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  aiBadgeText: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  detailsContainer: {
    padding: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  highlightBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: '#FBBF24',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  highlightBadgeText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 10,
    lineHeight: 28,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 6,
  },
  stars: {
    flexDirection: 'row',
  },
  ratingScore: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FBBF24',
  },
  reviewCount: {
    fontSize: 12,
    color: '#94A3B8',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111C38',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 203, 0.2)',
    marginBottom: 22,
  },
  priceLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 4,
    fontWeight: '500',
  },
  price: {
    fontSize: 24,
    fontWeight: '800',
    color: '#00C2CB',
  },
  freeInstallTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 194, 203, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 203, 0.3)',
  },
  freeInstallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00C2CB',
  },
  freeInstallSub: {
    fontSize: 9,
    color: '#94A3B8',
  },
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 14,
    color: '#CBD5E1',
    lineHeight: 22,
  },
  featuresList: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  featureIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 194, 203, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 18,
  },
  specTable: {
    backgroundColor: '#111C38',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  specRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  specRowAlt: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  specRowLast: {
    borderBottomWidth: 0,
  },
  specKey: {
    flex: 1,
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  specVal: {
    flex: 1.2,
    fontSize: 12,
    color: '#F8FAFC',
    fontWeight: '700',
  },
  assuranceBox: {
    backgroundColor: '#111C38',
    borderRadius: 16,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 203, 0.15)',
  },
  assuranceHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00C2CB',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  assuranceItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  assuranceTextCol: {
    flex: 1,
  },
  assuranceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  assuranceDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0F1A3A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 194, 203, 0.2)',
    gap: 12,
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16234D',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 203, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 10,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#20326B',
  },
  qtyBtnDisabled: {
    backgroundColor: '#16234D',
    opacity: 0.4,
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    minWidth: 20,
    textAlign: 'center',
  },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00C2CB',
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#00C2CB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaBtnDisabled: {
    backgroundColor: '#475569',
    shadowOpacity: 0,
  },
  ctaBtnText: {
    color: '#0A1128',
    fontSize: 15,
    fontWeight: '800',
  },
  floatingToast: {
    position: 'absolute',
    top: 64,
    left: 20,
    right: 20,
    backgroundColor: '#0D384D',
    borderColor: '#00E5FF',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    elevation: 8,
  },
  floatingToastText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
});
