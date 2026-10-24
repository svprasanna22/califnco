import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchProducts } from '../services/productService';
import type { Product, ProductCategory } from '../types/product';
import { PRODUCT_CATEGORIES } from '../types/product';
import { ProductCard } from '../components/common/ProductCard';
import { useCart } from '../context/CartContext';

interface HomeScreenProps {
  onSelectProduct: (product: Product) => void;
  onNavigateToProducts: (category?: ProductCategory | 'all') => void;
}

export function HomeScreen({ onSelectProduct, onNavigateToProducts }: HomeScreenProps) {
  const { addToCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addedToast, setAddedToast] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to load products from Firestore.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
  };

  const handleAddToCart = (product: Product) => {
    addToCart(product, 1);
    setAddedToast(`Added "${product.name}" to cart!`);
    setTimeout(() => setAddedToast(null), 3000);
  };

  // Filter products by selected category and search text
  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategory === 'all' || p.category === selectedCategory;
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.description.toLowerCase().includes(term);
    return matchesCategory && matchesSearch;
  });

  // Featured purifiers (top 5 rated RO & UV units)
  const featuredPurifiers = products
    .filter((p) => p.category === 'ro-purifiers' || p.category === 'uv-uf-purifiers')
    .slice(0, 5);

  const demoCount = products.filter((p) => p.isDemo || p.id.startsWith('demo-prod-')).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />}
    >
      {/* Toast Notification */}
      {addedToast && (
        <View style={styles.toast}>
          <Feather name="check-circle" size={16} color="#06b6d4" />
          <Text style={styles.toastText}>{addedToast}</Text>
        </View>
      )}

      {/* Large 2026 Editorial Hero Section */}
      <View style={styles.heroBanner}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroBadge}>
            <MaterialCommunityIcons name="shield-check" size={14} color="#06b6d4" />
            <Text style={styles.heroBadgeText}>Certified Water Technologies</Text>
          </View>
          {demoCount > 0 && (
            <View style={styles.heroDemoBadge}>
              <Text style={styles.heroDemoBadgeText}>{demoCount} DEMO MODELS</Text>
            </View>
          )}
        </View>

        <Text style={styles.heroTitle}>Pure Water.{'\n'}Elevated Living.</Text>
        <Text style={styles.heroSubtitle}>
          Engineered specifically for Indian municipal & high-TDS borewell water. Retains essential calcium, magnesium, and natural electrolytes.
        </Text>

        {/* Live Quality Assurance Stats */}
        <View style={styles.heroStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>99.9%</Text>
            <Text style={styles.statLabel}>TDS Reduction</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>FREE</Text>
            <Text style={styles.statLabel}>Doorstep Setup</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>1-YR</Text>
            <Text style={styles.statLabel}>Onsite Warranty</Text>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={18} color="#06b6d4" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search smart RO, UV filters, cartridges, spares..."
          placeholderTextColor="#64748b"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Feather name="x" size={16} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Navigation Pills */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTitleRow}>
          <Feather name="grid" size={16} color="#06b6d4" />
          <Text style={styles.sectionTitle}>Product Categories</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesScroll}
      >
        {PRODUCT_CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const count =
            cat.id === 'all'
              ? products.length
              : products.filter((p) => p.category === cat.id).length;

          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
              onPress={() => setSelectedCategory(cat.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  isSelected && styles.categoryPillTextActive,
                ]}
              >
                {cat.name}
              </Text>
              <View
                style={[
                  styles.categoryCountBadge,
                  isSelected && styles.categoryCountBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryCountText,
                    isSelected && styles.categoryCountTextActive,
                  ]}
                >
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Featured Products Showcase (when viewing all categories) */}
      {selectedCategory === 'all' && !searchQuery.trim() && featuredPurifiers.length > 0 && (
        <View style={styles.featuredSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderTitleRow}>
              <MaterialCommunityIcons name="star-shooting-outline" size={18} color="#fbbf24" />
              <Text style={styles.sectionTitle}>Featured Flagship Purifiers</Text>
            </View>
            <TouchableOpacity
              onPress={() => onNavigateToProducts('ro-purifiers')}
              style={styles.seeAllBtn}
            >
              <Text style={styles.seeAllText}>Explore All</Text>
              <Feather name="arrow-right" size={14} color="#06b6d4" />
            </TouchableOpacity>
          </View>

          {featuredPurifiers.slice(0, 2).map((product) => (
            <ProductCard
              key={`featured-${product.id}`}
              product={product}
              onPress={onSelectProduct}
              onAddToCart={handleAddToCart}
            />
          ))}
        </View>
      )}

      {/* Main Catalog Section */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTitleRow}>
          <Feather name="layers" size={16} color="#06b6d4" />
          <Text style={styles.sectionTitle}>
            {selectedCategory === 'all'
              ? `Catalog (${filteredProducts.length} Items)`
              : `${PRODUCT_CATEGORIES.find((c) => c.id === selectedCategory)?.name || 'Products'} (${filteredProducts.length})`}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onNavigateToProducts(selectedCategory)}
          style={styles.seeAllBtn}
        >
          <Text style={styles.seeAllText}>Full View</Text>
          <Feather name="chevron-right" size={16} color="#06b6d4" />
        </TouchableOpacity>
      </View>

      {/* Loading State */}
      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#06b6d4" />
          <Text style={styles.stateText}>Loading authentic purifiers from Firestore...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Feather name="alert-circle" size={24} color="#f87171" />
          <Text style={styles.errorTitle}>Catalog Notice</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadProducts}>
            <Text style={styles.retryBtnText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="water-off" size={44} color="#64748b" />
          <Text style={styles.emptyTitle}>
            {products.length === 0 ? 'No Products in Firestore Catalog' : 'No Matching Products Found'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {products.length === 0
              ? 'Use the Admin Portal to seed 50 demo water purifiers, cartridges, and spare parts.'
              : `No items matching "${searchQuery}". Try searching for RO, UV, Cartridge, or Pump.`}
          </Text>
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              onPress={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              <Text style={styles.clearSearchText}>Reset All Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* Product Cards Grid */
        <View style={styles.productsGrid}>
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onPress={onSelectProduct}
              onAddToCart={handleAddToCart}
            />
          ))}
        </View>
      )}

      {/* Trust & Guarantee Section */}
      <View style={styles.trustBanner}>
        <Text style={styles.trustTitle}>The Califnco Advantage</Text>
        <View style={styles.trustGrid}>
          <View style={styles.trustItem}>
            <Feather name="tool" size={18} color="#06b6d4" />
            <Text style={styles.trustItemTitle}>Doorstep Unboxing</Text>
            <Text style={styles.trustItemDesc}>Certified field technicians verify water TDS upon installation.</Text>
          </View>
          <View style={styles.trustItem}>
            <Feather name="shield" size={18} color="#06b6d4" />
            <Text style={styles.trustItemTitle}>1-Year Warranty</Text>
            <Text style={styles.trustItemDesc}>Comprehensive onsite replacement for pump, power & electricals.</Text>
          </View>
          <View style={styles.trustItem}>
            <Feather name="check-circle" size={18} color="#06b6d4" />
            <Text style={styles.trustItemTitle}>Zero Heavy Metals</Text>
            <Text style={styles.trustItemDesc}>Tested against BIS 10500 standards for lead, arsenic, and PFAS.</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  toastText: {
    color: '#06b6d4',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  heroBanner: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 22,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  heroBadgeText: {
    color: '#06b6d4',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroDemoBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  heroDemoBadgeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f8fafc',
    lineHeight: 32,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 19,
    marginBottom: 18,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#06b6d4',
  },
  statLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  sectionHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: -0.3,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#06b6d4',
  },
  categoriesScroll: {
    gap: 10,
    paddingBottom: 20,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  categoryPillActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06b6d4',
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  categoryPillTextActive: {
    color: '#06b6d4',
    fontWeight: '700',
  },
  categoryCountBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  categoryCountBadgeActive: {
    backgroundColor: '#06b6d4',
  },
  categoryCountText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '700',
  },
  categoryCountTextActive: {
    color: '#0f172a',
  },
  featuredSection: {
    marginBottom: 16,
  },
  productsGrid: {
    gap: 12,
  },
  centerState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 13,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  errorTitle: {
    color: '#f87171',
    fontWeight: '700',
    fontSize: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  errorText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  retryBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#06b6d4',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBox: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    marginVertical: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 12,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  clearSearchBtn: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#06b6d4',
  },
  clearSearchText: {
    color: '#06b6d4',
    fontSize: 13,
    fontWeight: '700',
  },
  trustBanner: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 20,
    marginTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  trustTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  trustGrid: {
    gap: 14,
  },
  trustItem: {
    flexDirection: 'column',
    gap: 4,
  },
  trustItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#38bdf8',
  },
  trustItemDesc: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 16,
  },
});
