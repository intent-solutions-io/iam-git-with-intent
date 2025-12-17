/**
 * Admin Connectors Page
 *
 * Phase 12: Connector configuration management for tenant administrators.
 * Lists all configured connectors with their status.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface ConnectorConfig {
  connectorId: string;
  enabled: boolean;
  baseUrl?: string;
  timeouts: { connectMs: number; readMs: number };
  rateLimit?: { requestsPerMinute?: number; requestsPerHour?: number };
  secretRefKeys: string[];
  hasCustomConfig: boolean;
  updatedAt: string;
  updatedBy: string;
}

// Available connectors (registry)
const AVAILABLE_CONNECTORS = [
  { id: 'github', name: 'GitHub', description: 'GitHub API integration', icon: 'G' },
  { id: 'gitlab', name: 'GitLab', description: 'GitLab API integration', icon: 'L' },
  { id: 'slack', name: 'Slack', description: 'Slack notifications', icon: 'S' },
  { id: 'jira', name: 'Jira', description: 'Jira ticket integration', icon: 'J' },
  { id: 'linear', name: 'Linear', description: 'Linear issue tracking', icon: 'Li' },
];

export function AdminConnectors() {
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTenant || !user) {
      setLoading(false);
      return;
    }

    const fetchConnectors = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || ''}/tenants/${currentTenant.id}/connectors`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          setConnectors(data.connectors || []);
        }
      } catch (err) {
        setError('Failed to load connectors');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchConnectors();
  }, [currentTenant, user]);

  if (tenantLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!currentTenant) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">No Organization Selected</h2>
        <p className="text-gray-600">Select an organization to manage connectors.</p>
      </div>
    );
  }

  // Merge available connectors with configured ones
  const connectorList = AVAILABLE_CONNECTORS.map((available) => {
    const config = connectors.find((c) => c.connectorId === available.id);
    return {
      ...available,
      config,
      configured: !!config,
      enabled: config?.enabled ?? false,
    };
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Connectors</h1>
        <p className="text-gray-600 mt-1">
          Configure external service integrations for your organization
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="divide-y divide-gray-200">
          {connectorList.map((connector) => (
            <div key={connector.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center font-semibold text-gray-600">
                  {connector.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{connector.name}</span>
                    {connector.configured && (
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          connector.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {connector.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{connector.description}</p>
                  {connector.config && (
                    <p className="text-xs text-gray-400 mt-1">
                      {connector.config.secretRefKeys.length} secrets configured
                    </p>
                  )}
                </div>
              </div>
              <Link
                to={`/admin/connectors/${connector.id}`}
                className="px-4 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
              >
                {connector.configured ? 'Configure' : 'Set up'}
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-sm text-gray-500">
        <p>
          Need a connector not listed here?{' '}
          <a href="mailto:support@gwi.dev" className="text-blue-600 hover:underline">
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}
