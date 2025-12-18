/**
 * Instances Page
 *
 * Phase 13: List workflow instances for current tenant
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface InstanceInfo {
  id: string;
  tenantId: string;
  templateRef: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  runCount: number;
}

export function Instances() {
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTenant || !user) {
      setLoading(false);
      return;
    }

    const fetchInstances = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || ''}/v1/tenants/${currentTenant.id}/instances`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          setInstances(data.instances);
        } else {
          setError('Failed to load instances');
        }
      } catch (err) {
        setError('Failed to load instances');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchInstances();
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
        <p className="text-gray-600">Select an organization to view workflow instances.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Instances</h1>
          <p className="text-gray-600 mt-1">
            Configured workflow instances for {currentTenant.name}
          </p>
        </div>
        <Link
          to="/templates"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Create Instance
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Instances Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {instances.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="mb-4">No workflow instances yet.</p>
            <Link
              to="/templates"
              className="text-blue-600 hover:text-blue-800"
            >
              Browse templates to create your first instance
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Template
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Runs
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Run
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {instances.map(instance => (
                <tr key={instance.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{instance.name}</div>
                    {instance.description && (
                      <div className="text-sm text-gray-500">{instance.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-600">{instance.templateRef}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        instance.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {instance.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {instance.runCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {instance.lastRunAt
                      ? new Date(instance.lastRunAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      to={`/instances/${instance.id}`}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      Configure
                    </Link>
                    <button className="text-gray-600 hover:text-gray-900">
                      Run
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
