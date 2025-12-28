/**
 * Protected Route Component
 *
 * Redirects unauthenticated users to login and enforces RBAC.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../hooks/useTenant';

/**
 * RBAC roles (from @gwi/core/security/rbac)
 */
export type RBACRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Minimum required role (optional) */
  requireRole?: RBACRole;
}

/**
 * Role hierarchy for permission checks
 */
const ROLE_HIERARCHY: Record<RBACRole, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/**
 * Check if user's role meets minimum requirement
 */
function hasMinimumRole(userRole: RBACRole, requiredRole: RBACRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function ProtectedRoute({ children, requireRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const { currentTenant } = useTenant();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If role is required, check user's role in current tenant
  if (requireRole && currentTenant) {
    const userRole = currentTenant.role as RBACRole;

    if (!userRole || !hasMinimumRole(userRole, requireRole)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 max-w-md">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Access Denied
            </h1>
            <p className="text-gray-600 mb-4">
              You don't have permission to access this page.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Required role: <strong>{requireRole}</strong>
              {userRole && (
                <>
                  <br />
                  Your role: <strong>{userRole}</strong>
                </>
              )}
            </p>
            <button
              onClick={() => window.history.back()}
              className="w-full bg-gray-900 text-white px-4 py-2 rounded-md font-medium hover:bg-gray-800"
            >
              Go Back
            </button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
