import { useState, useEffect, useCallback, useMemo } from 'react';
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

interface ProductsScreenProps {
  initialCategory?: ProductCategory | 'all';
  onSelectProduct: (product: Product) => void;
}

type SortOption = 'newest' | 'price_low_high' | 'price_high_low' | 'rating';
type InventoryFilter = 'all' | 'real' | 'demo';

export function ProductsScreen({
  initialCategory = 'all',
  onSelectProduct,
}: ProductsScreenProps) {
  const { addToCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<ProductCategory | 'all'>(initialCategory);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>('all');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (initialCategory) {
      setCategory(initialCategory);
    }
  }, [initialCategory]);

  const loadProducts = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to retrieve catalog from Firestore.');
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
    setToast(`Added "${product.name}" to your cart`);
    setTimeout(() => setToast(null), 3000);
  };

  const demoCount = useMemo(() => products.filter((p) => p.isDemo).length, [products]);
  const realCount = useMemo(() => products.filter((p) => !p.isDemo).length, [products]);

  const processedProducts = useMemo(() => {
    return products
      .filter((p) => {
        const matchesCategory = category === 'all' || p.category === category;
        const term = search.toLowerCase().trim();
        const matchesSearch =
          !term ||
          p.name.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term) ||
          p.specifications?.['Filtration Stages']?.toLowerCase().includes(term);
        const matchesInventory =
          inventoryFilter === 'all'
            ? true
            : inventoryFilter === 'demo'
            ? p.isDemo === true
            : p.isDemo !== true;
        return matchesCategory && matchesSearch && matchesInventory;
      })
      .sort((a, b) => {
        if (sort === 'price_low_high') return Number(a.price) - Number(b.price);
        if (sort === 'price_high_low') return Number(b.price) - Number(a.price);
        if (sort === 'rating') return (b.rating || 4.5) - (a.rating || 4.5);
        return 0;
      });
  }, [products, category, search, inventoryFilter, sort]);

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.headerArea}>
        <View style={styles.searchBar}>
          <Feather name="search" size={17} color="#00C2CB" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search purifiers, membranes, spare parts..."
            placeholderTextColor="#64748B"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Inventory Scope Selector */}
        <View style={styles.scopeRow}>
          <TouchableOpacity
            style={[styles.scopeChip, inventoryFilter === 'all' && styles.scopeChipActive]}
            onPress={() => setInventoryFilter('all')}
          >
            <Text style={[styles.scopeChipText, inventoryFilter === 'all' && styles.scopeChipTextActive]}>
              All Systems ({products.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeChip, inventoryFilter === 'real' && styles.scopeChipActive]}
            onPress={() => setInventoryFilter('real')}
          >
            <View style={styles.scopeDotReal} />
            <Text style={[styles.scopeChipText, inventoryFilter === 'real' && styles.scopeChipTextActive]}>
              Live Stock ({realCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeChip, inventoryFilter === 'demo' && styles.scopeChipActiveDemo]}
            onPress={() => setInventoryFilter('demo')}
          >
            <View style={styles.scopeDotDemo} />
            <Text style={[styles.scopeChipText, inventoryFilter === 'demo' && styles.scopeChipTextActiveDemo]}>
              Demo Catalog ({demoCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Toast Alert */}
      {toast && (
        <View style={styles.toast}>
          <Feather name="check-circle" size={14} color="#00E5FF" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* Category Horizontal Filter */}
      <View style={styles.categoryContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {PRODUCT_CATEGORIES.map((cat) => {
            const isSelected = category === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.catTab, isSelected && styles.catTabActive]}
                onPress={() => setCategory(cat.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.catText, isSelected && styles.catTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Sort & Count Sub-bar */}
      <View style={styles.sortBar}>
        <Text style={styles.resultsCount}>
          <Text style={styles.resultsCountHighlight}>{processedProducts.length}</Text> verified item{processedProducts.length !== 1 ? 's' : ''}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortOptions}>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'newest' && styles.sortBtnActive]}
            onPress={() => setSort('newest')}
          >
            <Text style={[styles.sortText, sort === 'newest' && styles.sortTextActive]}>Newest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'rating' && styles.sortBtnActive]}
            onPress={() => setSort('rating')}
          >
            <Feather name="star" size={11} color={sort === 'rating' ? '#0A1128' : '#94A3B8'} />
            <Text style={[styles.sortText, sort === 'rating' && styles.sortTextActive]}>Top Rated</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'price_low_high' && styles.sortBtnActive]}
            onPress={() => setSort('price_low_high')}
          >
            <Text style={[styles.sortText, sort === 'price_low_high' && styles.sortTextActive]}>Price: Low</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'price_high_low' && styles.sortBtnActive]}
            onPress={() => setSort('price_high_low')}
          >
            <Text style={[styles.sortText, sort === 'price_high_low' && styles.sortTextActive]}>Price: High</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Product List */}
      <ScrollView
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C2CB" />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#00C2CB" />
            <Text style={styles.stateText}>Calibrating catalog from Cloud Firestore...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={24} color="#F87171" />
            <Text style={styles.errorTitle}>Catalog Retrieval Error</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadProducts}>
              <Text style={styles.retryBtnText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        ) : processedProducts.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="water-off" size={48} color="#475569" />
            <Text style={styles.emptyTitle}>No Matching Systems</Text>
            <Text style={styles.emptySubtitle}>
              Try adjusting your category filter, clearing your search query, or switching between live inventory and demo models.
            </Text>
            <TouchableOpacity
              style={styles.clearFiltersBtn}
              onPress={() => {
                setCategory('all');
                setSearch('');
                setInventoryFilter('all');
              }}
            >
              <Text style={styles.clearFiltersBtnText}>Reset All Filters</Text>
            </TouchableOpacity>
          </View>
        ) : (
          processedProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onPress={onSelectProduct}
              onAddToCart={handleAddToCart}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  headerArea: {
    backgroundColor: '#0F1A3A',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 194, 203, 0.15)',
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16234D',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 203, 0.2)',
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    padding: 0,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  scopeChipActive: {
    backgroundColor: 'rgba(0, 194, 203, 0.15)',
    borderColor: '#00C2CB',
  },
  scopeChipActiveDemo: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: '#A855F7',
  },
  scopeChipText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  scopeChipTextActive: {
    color: '#00C2CB',
    fontWeight: '700',
  },
  scopeChipTextActiveDemo: {
    color: '#C084FC',
    fontWeight: '700',
  },
  scopeDotReal: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  scopeDotDemo: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A855F7',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F2942',
    borderBottomWidth: 1,
    borderBottomColor: '#00C2CB',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryContainer: {
    backgroundColor: '#0A1128',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  categoryScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#16234D',
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 203, 0.15)',
  },
  catTabActive: {
    backgroundColor: '#00C2CB',
    borderColor: '#00C2CB',
  },
  catText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  catTextActive: {
    color: '#0A1128',
    fontWeight: '800',
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0A1128',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  resultsCount: {
    fontSize: 12,
    color: '#64748B',
    marginRight: 8,
  },
  resultsCountHighlight: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  sortOptions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#16234D',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sortBtnActive: {
    backgroundColor: '#00C2CB',
    borderColor: '#00C2CB',
  },
  sortText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  sortTextActive: {
    color: '#0A1128',
    fontWeight: '800',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  centerState: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 14,
    fontWeight: '500',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginVertical: 16,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F87171',
    marginTop: 8,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyBox: {
    backgroundColor: '#111C38',
    borderRadius: 18,
    padding: 36,
    alignItems: 'center',
    marginVertical: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 14,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  clearFiltersBtn: {
    backgroundColor: '#16234D',
    borderWidth: 1,
    borderColor: '#00C2CB',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  clearFiltersBtnText: {
    color: '#00C2CB',
    fontSize: 12,
    fontWeight: '700',
  },
});
