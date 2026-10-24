import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';

export type TabKey = 'home' | 'products' | 'cart' | 'orders' | 'profile';

interface BottomTabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
  const { totalItemsCount } = useCart();
  const { role } = useAuth();
  const isDealer = role === 'dealer';

  const tabs: { key: TabKey; label: string; icon: keyof typeof Feather.glyphMap }[] = isDealer
    ? [
        { key: 'home', label: 'Dashboard', icon: 'layout' },
        { key: 'products', label: 'Catalogue', icon: 'grid' },
        { key: 'cart', label: 'Dealer Cart', icon: 'shopping-cart' },
        { key: 'orders', label: 'Orders', icon: 'clipboard' },
        { key: 'profile', label: 'Dealership', icon: 'briefcase' },
      ]
    : [
        { key: 'home', label: 'Home', icon: 'home' },
        { key: 'products', label: 'Products', icon: 'grid' },
        { key: 'cart', label: 'Cart', icon: 'shopping-cart' },
        { key: 'orders', label: 'My Orders', icon: 'clipboard' },
        { key: 'profile', label: 'Profile', icon: 'user' },
      ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabItem}
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <Feather
                name={tab.icon}
                size={22}
                color={isActive ? '#06b6d4' : '#64748b'}
              />
              {tab.key === 'cart' && totalItemsCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.badgeText}>
                    {totalItemsCount > 9 ? '9+' : totalItemsCount}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.tabLabel,
                { color: isActive ? '#06b6d4' : '#64748b', fontWeight: isActive ? '700' : '500' },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.12)',
    paddingVertical: 8,
    paddingBottom: 16,
    justifyContent: 'space-around',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#06b6d4',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#0f172a',
    fontSize: 9,
    fontWeight: '800',
  },
  tabLabel: {
    fontSize: 11,
  },
});
