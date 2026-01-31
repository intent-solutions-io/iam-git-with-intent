/**
 * Layout Component
 *
 * Main application layout with responsive sidebar and navigation.
 */


import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../hooks/useTenant';
import { Sidebar } from './Sidebar';

export function Layout() {
  const { user, signOut } = useAuth();
  const { tenants, currentTenant, selectTenant } = useTenant();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Routes that show sidebar (authenticated app routes including /marketplace, /dashboard, etc.)
  const showSidebar = user && !['/', '/login', '/signup', '/features', '/install', '/how-it-works', '/security', '/pricing', '/docs'].includes(location.pathname);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left side: Menu + Logo */}
            <div className="flex items-center space-x-4">
              {/* Mobile menu button */}
              {showSidebar && (
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="lg:hidden p-2 rounded-md hover:bg-gray-100"
                  aria-label="Toggle menu"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}

              {/* Logo */}
              <Link to="/" className="flex items-center space-x-2">
                <span className="text-xl font-bold text-gray-900">
                  Git With Intent
                </span>
              </Link>
            </div>

            {/* Right side: Tenant + User menu */}
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
                <div className="flex items-center space-x-2">
                  <Link
                    to="/login"
                    className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar (only for authenticated pages) */}
      {showSidebar && (
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main className={`pt-16 ${showSidebar ? 'lg:pl-64' : ''}`}>
        <div className={`${showSidebar ? 'px-4 sm:px-6 lg:px-8 py-8' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}`}>
          <Outlet />
        </div>
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
