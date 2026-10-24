import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import {
  loginWithEmail,
  registerWithEmail,
  logoutUser,
  subscribeToAuthState,
} from '../services/authService';
import {
  getVerifiedDealerProfile,
  type DealerProfileResult,
} from '../services/dealerAuthService';
import type { Dealer } from '../types/dealer';

export type AccountRole = 'customer' | 'dealer';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  role: AccountRole;
  setRole: (role: AccountRole) => void;
  dealerProfile: Dealer | null;
  dealerStatus: DealerProfileResult['status'] | null;
  dealerMessage: string | null;
  isDealerActive: boolean;
  login: (email: string, password: string, intendedRole?: AccountRole) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshDealerProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [role, setRoleState] = useState<AccountRole>('customer');
  const [dealerProfile, setDealerProfile] = useState<Dealer | null>(null);
  const [dealerStatus, setDealerStatus] = useState<DealerProfileResult['status'] | null>(null);
  const [dealerMessage, setDealerMessage] = useState<string | null>(null);

  const verifyDealer = useCallback(async (uid: string, email?: string | null) => {
    try {
      const res = await getVerifiedDealerProfile(uid, email);
      setDealerProfile(res.dealer);
      setDealerStatus(res.status);
      setDealerMessage(res.message);
    } catch {
      setDealerProfile(null);
      setDealerStatus('not_found');
      setDealerMessage('Failed to verify dealer profile.');
    }
  }, []);

  const refreshDealerProfile = useCallback(async () => {
    if (user?.uid) {
      await verifyDealer(user.uid, user.email);
    }
  }, [user, verifyDealer]);

  const setRole = (newRole: AccountRole) => {
    setRoleState(newRole);
    if (newRole === 'dealer' && user?.uid) {
      verifyDealer(user.uid, user.email);
    } else if (newRole === 'customer') {
      // Clear dealer verification errors for normal customer browsing
      setDealerStatus(null);
      setDealerMessage(null);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (currentUser) => {
      setUser(currentUser);
      if (currentUser && role === 'dealer') {
        await verifyDealer(currentUser.uid, currentUser.email);
      } else {
        setDealerProfile(null);
        setDealerStatus(null);
        setDealerMessage(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [role, verifyDealer]);

  const login = async (email: string, password: string, intendedRole: AccountRole = 'customer') => {
    setRoleState(intendedRole);
    const loggedInUser = await loginWithEmail(email, password);
    setUser(loggedInUser);

    if (intendedRole === 'dealer') {
      await verifyDealer(loggedInUser.uid, loggedInUser.email);
    }
  };

  const register = async (email: string, password: string) => {
    // Only customer accounts can be registered self-service
    setRoleState('customer');
    const registeredUser = await registerWithEmail(email, password);
    setUser(registeredUser);
    setDealerProfile(null);
    setDealerStatus(null);
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    setDealerProfile(null);
    setDealerStatus(null);
    setDealerMessage(null);
    setRoleState('customer');
  };

  const isDealerActive =
    role === 'dealer' &&
    dealerStatus === 'verified_active' &&
    dealerProfile !== null &&
    dealerProfile.status === 'active';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        role,
        setRole,
        dealerProfile,
        dealerStatus,
        dealerMessage,
        isDealerActive,
        login,
        register,
        logout,
        refreshDealerProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
