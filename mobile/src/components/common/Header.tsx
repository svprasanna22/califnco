import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';

interface HeaderProps {
  onCartPress: () => void;
  onProfilePress: () => void;
}

export function Header({ onCartPress, onProfilePress }: HeaderProps) {
  const { user, role, dealerProfile, isDealerActive } = useAuth();
  const { totalItemsCount } = useCart();

  const isDealer = role === 'dealer';

  return (
    <View style={styles.header}>
      {/* Brand Title & Logo */}
      <View style={styles.brandContainer}>
        <View style={[styles.iconCircle, isDealer && styles.iconCircleDealer]}>
          <MaterialCommunityIcons
            name={isDealer ? 'store' : 'water'}
            size={22}
            color={isDealer ? '#fbbf24' : '#06b6d4'}
          />
        </View>
        <View>
          <Text style={styles.brandName}>Califnco</Text>
          <Text style={[styles.brandSub, isDealer && styles.brandSubDealer]}>
            {isDealer
              ? isDealerActive && dealerProfile?.dealerCode
                ? `DEALER • ${dealerProfile.dealerCode}`
                : 'DEALER PORTAL'
              : 'PURIFIERS & SERVICE'}
          </Text>
        </View>
      </View>

      {/* Action Icons */}
      <View style={styles.actionsContainer}>
        {/* User / Sign In */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onProfilePress}
          activeOpacity={0.7}
        >
          <Feather
            name={user ? 'user-check' : 'user'}
            size={20}
            color={user ? '#06b6d4' : '#94a3b8'}
          />
        </TouchableOpacity>

        {/* Cart with count badge */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onCartPress}
          activeOpacity={0.7}
        >
          <Feather name="shopping-cart" size={20} color="#f8fafc" />
          {totalItemsCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>
                {totalItemsCount > 99 ? '99+' : totalItemsCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.12)',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleDealer: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  brandSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#06b6d4',
    letterSpacing: 1.2,
  },
  brandSubDealer: {
    color: '#fbbf24',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#06b6d4',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#0f172a',
    fontSize: 10,
    fontWeight: '800',
  },
});
