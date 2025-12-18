/**
 * Layout Component
 *
 * Main application layout with navigation and tenant selector.
 */


import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../hooks/useTenant';

export function Layout() {
  const { user, signOut } = useAuth();
  const { tenants, currentTenant, selectTenant } = useTenant();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold text-gray-900">
                Git With Intent
              </span>
            </Link>

            {/* Navigation */}
            {user && (
              <nav className="flex items-center space-x-6">
                <Link
                  to="/dashboard"
                  className="text-gray-600 hover:text-gray-900"
                >
                  Dashboard
                </Link>
                <Link to="/runs" className="text-gray-600 hover:text-gray-900">
                  Runs
                </Link>
                <Link to="/usage" className="text-gray-600 hover:text-gray-900">
                  Usage
                </Link>
                <Link
                  to="/settings"
                  className="text-gray-600 hover:text-gray-900"
                >
                  Settings
                </Link>
              </nav>
            )}

            {/* User menu */}
            <div className="flex items-center space-x-4">
              {/* Tenant selector */}
              {user && tenants.length > 0 && (
                <select
                  value={currentTenant?.id || ''}
                  onChange={(e) => selectTenant(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                >
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              )}

              {/* User info */}
              {user ? (
                <div className="flex items-center space-x-3">
                  {user.photoURL && (
                    <img
                      src={user.photoURL}
                      alt=""
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <button
                    onClick={() => signOut()}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500">
            Git With Intent - AI-Powered DevOps Automation
          </p>
        </div>
      </footer>
    </div>
  );
}
