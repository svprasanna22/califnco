import { useState, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LogoIcon,
  DashboardIcon,
  ProductsIcon,
  OrdersIcon,
  DealersIcon,
  ServiceIcon,
  SettingsIcon,
  LogOutIcon,
  MenuIcon,
  CloseIcon,
  ShieldCheckIcon,
  BellIcon,
  SearchIcon,
  UsersIcon,
  InventoryIcon,
} from '../common/Icons';

export type NavViewKey = 'dashboard' | 'products' | 'inventory' | 'orders' | 'customers' | 'dealers' | 'service' | 'settings';

interface DashboardLayoutProps {
  currentView: NavViewKey;
  onNavigate: (view: NavViewKey) => void;
  children: ReactNode;
}

export function DashboardLayout({ currentView, onNavigate, children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { key: 'dashboard' as NavViewKey, label: 'Dashboard', icon: <DashboardIcon style={{ width: 18, height: 18 }} /> },
    { key: 'products' as NavViewKey, label: 'Products', icon: <ProductsIcon style={{ width: 18, height: 18 }} /> },
    { key: 'inventory' as NavViewKey, label: 'Inventory', icon: <InventoryIcon style={{ width: 18, height: 18 }} /> },
    { key: 'orders' as NavViewKey, label: 'Orders', icon: <OrdersIcon style={{ width: 18, height: 18 }} /> },
    { key: 'customers' as NavViewKey, label: 'Customers', icon: <UsersIcon style={{ width: 18, height: 18 }} /> },
    { key: 'dealers' as NavViewKey, label: 'Dealers', icon: <DealersIcon style={{ width: 18, height: 18 }} /> },
    { key: 'service' as NavViewKey, label: 'Service Requests', icon: <ServiceIcon style={{ width: 18, height: 18 }} /> },
    { key: 'settings' as NavViewKey, label: 'Settings', icon: <SettingsIcon style={{ width: 18, height: 18 }} /> },
  ];

  const currentTitle = navItems.find((n) => n.key === currentView)?.label || 'Dashboard';

  return (
    <div className="dashboard-shell">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <LogoIcon style={{ width: 34, height: 34 }} />
          <div>
            <div className="sidebar-brand-title">Califnco</div>
            <span className="sidebar-brand-tag">PURIFIERS ADMIN</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = currentView === item.key;
            return (
              <button
                key={item.key}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  onNavigate(item.key);
                  setMobileMenuOpen(false);
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-badge">
            <div className="user-info">
              <span className="user-email-text" title={user?.email || ''}>
                {user?.email}
              </span>
              <span className="user-role-tag">
                <ShieldCheckIcon style={{ width: 12, height: 12 }} />
                Verified Admin
              </span>
            </div>

            <button
              className="btn-secondary"
              style={{ padding: '6px 10px', height: 32, borderColor: 'rgba(244, 63, 94, 0.4)', color: '#fda4af' }}
              onClick={logout}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOutIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        <header className="top-navbar">
          <div style={{ display: 'flex', alignContent: 'center', gap: 14 }}>
            <button
              className="btn-secondary"
              style={{ display: 'inline-flex', padding: 8, height: 36, width: 36, alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <CloseIcon style={{ width: 18, height: 18 }} />
              ) : (
                <MenuIcon style={{ width: 18, height: 18 }} />
              )}
            </button>
            <h1 className="nav-title">{currentTitle}</h1>
          </div>

          <div className="top-nav-actions">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 13,
                color: 'var(--text-muted)',
              }}
            >
              <SearchIcon style={{ width: 14, height: 14 }} />
              <input
                type="text"
                placeholder="Search orders, TDS, purifiers..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: 13,
                  outline: 'none',
                  width: 180,
                }}
              />
            </div>

            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              title="Notifications"
            >
              <BellIcon style={{ width: 16, height: 16 }} />
              <span
                style={{
                  position: 'absolute',
                  top: 7,
                  right: 7,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--cyan-primary)',
                  boxShadow: '0 0 8px var(--cyan-primary)',
                }}
              />
            </div>
          </div>
        </header>

        <main className="page-body">
          {children}
        </main>
      </div>
    </div>
  );
}
