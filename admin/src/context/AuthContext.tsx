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
  logoutUser,
  subscribeToAuthState,
  verifyAdminAuthorization,
  getFriendlyAuthErrorMessage,
  type AdminRoleStatus,
} from '../services/authService';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  adminStatus: AdminRoleStatus | null;
  loading: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  recheckAdminStatus: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminStatus, setAdminStatus] = useState<AdminRoleStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const checkRole = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setIsAdmin(false);
      setAdminStatus(null);
      return;
    }
    const status = await verifyAdminAuthorization(currentUser);
    setIsAdmin(status.isAdmin);
    setAdminStatus(status);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await checkRole(currentUser);
      } else {
        setIsAdmin(false);
        setAdminStatus(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [checkRole]);

  const login = async (email: string, password: string) => {
    setAuthError(null);
    setLoading(true);
    try {
      const loggedInUser = await loginWithEmail(email, password);
      await checkRole(loggedInUser);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      const friendlyMessage = getFriendlyAuthErrorMessage(firebaseError?.code || '');
      setAuthError(friendlyMessage);
      throw new Error(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setAuthError(null);
    try {
      await logoutUser();
      setUser(null);
      setIsAdmin(false);
      setAdminStatus(null);
    } catch (err: unknown) {
      console.error('Logout failed:', err);
    }
  };

  const recheckAdminStatus = async () => {
    if (user) {
      setLoading(true);
      await checkRole(user);
      setLoading(false);
    }
  };

  const clearError = () => {
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        adminStatus,
        loading,
        authError,
        login,
        logout,
        recheckAdminStatus,
        clearError,
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
