import { useState } from 'react';
import {
  SafeAreaView,
  View,
  StyleSheet,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import { Header } from './src/components/common/Header';
import { BottomTabBar, type TabKey } from './src/components/navigation/BottomTabBar';
import { HomeScreen } from './src/screens/HomeScreen';
import { DealerDashboardScreen } from './src/screens/DealerDashboardScreen';
import { ProductsScreen } from './src/screens/ProductsScreen';
import { ProductDetailScreen } from './src/screens/ProductDetailScreen';
import { CartScreen } from './src/screens/CartScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import type { Product, ProductCategory } from './src/types/product';

function MainApp() {
  const { role } = useAuth();
  const isDealer = role === 'dealer';

  const [currentTab, setCurrentTab] = useState<TabKey>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleNavigateToProducts = (category: ProductCategory | 'all' = 'all') => {
    setSelectedCategoryFilter(category);
    setSelectedProduct(null);
    setCurrentTab('products');
  };

  const handleTabChange = (tab: TabKey) => {
    setSelectedProduct(null);
    setCurrentTab(tab);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Main Content View */}
      <View style={styles.container}>
        {/* App Header (hidden when viewing full product details) */}
        {!selectedProduct && (
          <Header
            onCartPress={() => {
              setSelectedProduct(null);
              setCurrentTab('cart');
            }}
            onProfilePress={() => {
              setSelectedProduct(null);
              setCurrentTab('profile');
            }}
          />
        )}

        {/* Dynamic Screen Area */}
        <View style={styles.screenContainer}>
          {selectedProduct ? (
            <ProductDetailScreen
              product={selectedProduct}
              onBack={() => setSelectedProduct(null)}
              onGoToCart={() => {
                setSelectedProduct(null);
                setCurrentTab('cart');
              }}
            />
          ) : currentTab === 'home' ? (
            isDealer ? (
              <DealerDashboardScreen
                onNavigateToProducts={() => handleNavigateToProducts('all')}
                onNavigateToCart={() => {
                  setSelectedProduct(null);
                  setCurrentTab('cart');
                }}
                onNavigateToOrders={() => {
                  setSelectedProduct(null);
                  setCurrentTab('orders');
                }}
                onRequireAuth={() => setShowAuthModal(true)}
              />
            ) : (
              <HomeScreen
                onSelectProduct={setSelectedProduct}
                onNavigateToProducts={handleNavigateToProducts}
              />
            )
          ) : currentTab === 'products' ? (
            <ProductsScreen
              initialCategory={selectedCategoryFilter}
              onSelectProduct={setSelectedProduct}
            />
          ) : currentTab === 'cart' ? (
            <CartScreen
              onContinueShopping={() => handleNavigateToProducts('all')}
              onRequireAuth={() => setShowAuthModal(true)}
              onOrderSuccess={() => setCurrentTab('orders')}
            />
          ) : currentTab === 'orders' ? (
            <OrdersScreen
              onRequireAuth={() => setShowAuthModal(true)}
              onBrowseProducts={() => handleNavigateToProducts('all')}
            />
          ) : (
            <ProfileScreen
              onRequireAuth={() => setShowAuthModal(true)}
              onNavigateToOrders={() => setCurrentTab('orders')}
            />
          )}
        </View>

        {/* Bottom Tab Navigation (hidden when in product detail view) */}
        {!selectedProduct && (
          <BottomTabBar activeTab={currentTab} onTabChange={handleTabChange} />
        )}

        {/* Authentication Modal */}
        <Modal
          visible={showAuthModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowAuthModal(false)}
        >
          <AuthScreen
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => setShowAuthModal(false)}
          />
        </Modal>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <MainApp />
      </CartProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  screenContainer: {
    flex: 1,
  },
});
