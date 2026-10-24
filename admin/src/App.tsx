import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginForm } from './components/auth/LoginForm';
import { AccessDenied } from './components/auth/AccessDenied';
import { DashboardLayout, type NavViewKey } from './components/layout/DashboardLayout';
import { DashboardView } from './components/views/DashboardView';
import { ProductsView } from './components/views/ProductsView';
import { OrdersView } from './components/views/OrdersView';
import { DealersView } from './components/views/DealersView';
import { ServiceRequestsView } from './components/views/ServiceRequestsView';
import { SettingsView } from './components/views/SettingsView';
import { LogoIcon, SpinnerIcon } from './components/common/Icons';

function AppContent() {
  const { user, isAdmin, loading } = useAuth();
  const [currentView, setCurrentView] = useState<NavViewKey>('dashboard');

  // Initial Authentication & Role Verification Loading Splash
  if (loading) {
    return (
      <div className="splash-container">
        <div style={{ filter: 'drop-shadow(0 0 25px rgba(6, 182, 212, 0.4))' }}>
          <LogoIcon style={{ width: 64, height: 64 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 14 }}>
          <SpinnerIcon style={{ width: 16, height: 16, color: 'var(--cyan-primary)' }} />
          <span>Verifying administrator authorization...</span>
        </div>
      </div>
    );
  }

  // If not signed in, show Email/Password Login Form
  if (!user) {
    return <LoginForm />;
  }

  // If signed in but NOT an authorized administrator, show Access Denied
  if (!isAdmin) {
    return <AccessDenied />;
  }

  // Authorized Administrator: Show Protected Dashboard Shell
  return (
    <DashboardLayout currentView={currentView} onNavigate={setCurrentView}>
      {currentView === 'dashboard' && <DashboardView />}
      {currentView === 'products' && <ProductsView />}
      {currentView === 'orders' && <OrdersView />}
      {currentView === 'dealers' && <DealersView />}
      {currentView === 'service' && <ServiceRequestsView />}
      {currentView === 'settings' && <SettingsView />}
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
