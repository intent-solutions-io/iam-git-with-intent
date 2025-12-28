/**
 * useTenant Hook
 *
 * Manages tenant context for multi-tenant SaaS.
 * Fetches user's tenant memberships and provides current tenant.
 */

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface Tenant {
  id: string;
  name: string;
  type: 'organization' | 'user';
  installationId: number;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: Date;
  role?: string; // User's role in this tenant
}

export interface Membership {
  tenantId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'revoked';
}

export function useTenant() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch user's memberships and corresponding tenants
  useEffect(() => {
    if (!user) {
      setTenants([]);
      setCurrentTenant(null);
      setLoading(false);
      return;
    }

    const membershipsQuery = query(
      collection(db, 'gwi_memberships'),
      where('userId', '==', user.uid),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(
      membershipsQuery,
      async (snapshot) => {
        try {
          const fetchedMemberships = snapshot.docs.map(
            (doc) => doc.data() as Membership
          );

          // Fetch tenant details for each membership and attach role
          const tenantPromises = fetchedMemberships.map(async (membership) => {
            const tenantDoc = await getDoc(
              doc(db, 'gwi_tenants', membership.tenantId)
            );
            if (tenantDoc.exists()) {
              return {
                id: tenantDoc.id,
                ...tenantDoc.data(),
                role: membership.role, // Attach user's role in this tenant
              } as Tenant;
            }
            return null;
          });

          const fetchedTenants = (await Promise.all(tenantPromises)).filter(
            (t): t is Tenant => t !== null
          );

          setTenants(fetchedTenants);

          // Set first tenant as current if none selected
          if (!currentTenant && fetchedTenants.length > 0) {
            setCurrentTenant(fetchedTenants[0]);
          }

          setLoading(false);
        } catch (err) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          setLoading(false);
        }
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, currentTenant]);

  const selectTenant = (tenantId: string) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    if (tenant) {
      setCurrentTenant(tenant);
    }
  };

  return {
    tenants,
    currentTenant,
    selectTenant,
    loading,
    error,
  };
}
