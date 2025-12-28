/**
 * Sidebar Component
 *
 * Responsive navigation sidebar for authenticated users.
 */

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../hooks/useTenant';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/runs', label: 'Runs', icon: 'runs' },
  { path: '/queue', label: 'Queue', icon: 'queue' },
  { path: '/candidates', label: 'Candidates', icon: 'candidates' },
  { path: '/templates', label: 'Templates', icon: 'templates' },
  { path: '/instances', label: 'Instances', icon: 'instances' },
  { path: '/marketplace', label: 'Marketplace', icon: 'marketplace' },
  { path: '/usage', label: 'Usage', icon: 'usage' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
  { path: '/admin/connectors', label: 'Connectors', icon: 'connectors', adminOnly: true },
  { path: '/admin/policy', label: 'Policy', icon: 'policy', adminOnly: true },
  { path: '/admin/ops', label: 'Operations', icon: 'ops', adminOnly: true },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  const isAdmin = currentTenant?.role === 'ADMIN' || currentTenant?.role === 'OWNER';

  const filteredNavItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || isAdmin
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-16 left-0 bottom-0 w-64 bg-white border-r border-gray-200
          transform transition-transform duration-300 ease-in-out z-50
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <nav className="h-full overflow-y-auto p-4">
          <div className="space-y-1">
            {filteredNavItems.map((item) => {
              const isActive = location.pathname === item.path ||
                              location.pathname.startsWith(item.path + '/');

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={`
                    flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium
                    ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  <span className="w-5">{getIcon(item.icon)}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* User info at bottom */}
          {user && (
            <div className="mt-8 pt-4 border-t border-gray-200">
              <div className="flex items-center space-x-3 px-3">
                {user.photoURL && (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User avatar'}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user.displayName || user.email}
                  </p>
                  {currentTenant && (
                    <p className="text-xs text-gray-500 truncate">
                      {currentTenant.role}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}

/**
 * Simple icon mapping (replace with actual icon library if needed)
 */
function getIcon(name: string): string {
  const icons: Record<string, string> = {
    dashboard: '📊',
    runs: '▶️',
    queue: '📋',
    candidates: '🎯',
    templates: '📄',
    instances: '🔧',
    marketplace: '🛒',
    usage: '📈',
    settings: '⚙️',
    connectors: '🔌',
    policy: '📜',
    ops: '🔍',
  };
  return icons[name] || '•';
}
