/**
 * Admin Connector Config Page
 *
 * Phase 12: Individual connector configuration editor.
 */

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface ConnectorConfig {
  connectorId: string;
  enabled: boolean;
  baseUrl?: string;
  timeouts: { connectMs: number; readMs: number };
  rateLimit?: { requestsPerMinute?: number; requestsPerHour?: number };
  secretRefs: Record<string, string>;
  config: Record<string, unknown>;
  updatedAt: string;
  updatedBy: string;
}

// Connector metadata
const CONNECTOR_INFO: Record<string, { name: string; description: string; defaultBaseUrl?: string; secretFields: string[] }> = {
  github: {
    name: 'GitHub',
    description: 'GitHub API integration for repository access and PR operations',
    defaultBaseUrl: 'https://api.github.com',
    secretFields: ['GITHUB_TOKEN', 'GITHUB_APP_PRIVATE_KEY'],
  },
  gitlab: {
    name: 'GitLab',
    description: 'GitLab API integration for repository and merge request operations',
    defaultBaseUrl: 'https://gitlab.com/api/v4',
    secretFields: ['GITLAB_TOKEN'],
  },
  slack: {
    name: 'Slack',
    description: 'Slack webhook for notifications',
    secretFields: ['SLACK_WEBHOOK_URL', 'SLACK_BOT_TOKEN'],
  },
  jira: {
    name: 'Jira',
    description: 'Jira API for ticket synchronization',
    secretFields: ['JIRA_API_TOKEN', 'JIRA_EMAIL'],
  },
  linear: {
    name: 'Linear',
    description: 'Linear API for issue tracking',
    secretFields: ['LINEAR_API_KEY'],
  },
};

export function AdminConnectorConfig() {
  const { connectorId } = useParams<{ connectorId: string }>();
  const navigate = useNavigate();
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [config, setConfig] = useState<ConnectorConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(true);
  const [baseUrl, setBaseUrl] = useState('');
  const [connectMs, setConnectMs] = useState(5000);
  const [readMs, setReadMs] = useState(30000);
  const [requestsPerMinute, setRequestsPerMinute] = useState<number | ''>('');
  const [secretRefs, setSecretRefs] = useState<Record<string, string>>({});

  const connectorInfo = connectorId ? CONNECTOR_INFO[connectorId] : null;

  useEffect(() => {
    if (!currentTenant || !user || !connectorId) {
      setLoading(false);
      return;
    }

    const fetchConfig = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || ''}/tenants/${currentTenant.id}/connectors/${connectorId}/config`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          setEnabled(data.enabled);
          setBaseUrl(data.baseUrl || '');
          setConnectMs(data.timeouts?.connectMs || 5000);
          setReadMs(data.timeouts?.readMs || 30000);
          setRequestsPerMinute(data.rateLimit?.requestsPerMinute || '');
          // Secret refs are shown redacted, initialize with existing keys
          const refs: Record<string, string> = {};
          for (const key of connectorInfo?.secretFields || []) {
            refs[key] = data.secretRefs?.[key] || '';
          }
          setSecretRefs(refs);
        } else if (res.status === 404) {
          // No existing config, use defaults
          setEnabled(true);
          setBaseUrl(connectorInfo?.defaultBaseUrl || '');
          const refs: Record<string, string> = {};
          for (const key of connectorInfo?.secretFields || []) {
            refs[key] = '';
          }
          setSecretRefs(refs);
        }
      } catch (err) {
        setError('Failed to load connector config');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [currentTenant, user, connectorId, connectorInfo?.defaultBaseUrl, connectorInfo?.secretFields]);

  const handleSave = async () => {
    if (!currentTenant || !user || !connectorId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await user.getIdToken();

      // Only include non-empty secret refs
      const filteredSecretRefs: Record<string, string> = {};
      for (const [key, value] of Object.entries(secretRefs)) {
        if (value && !value.includes('...')) {
          // Don't send redacted values back
          filteredSecretRefs[key] = value;
        }
      }

      const payload = {
        enabled,
        baseUrl: baseUrl || undefined,
        timeouts: { connectMs, readMs },
        rateLimit: requestsPerMinute ? { requestsPerMinute: Number(requestsPerMinute) } : undefined,
        secretRefs: filteredSecretRefs,
        config: {},
      };

      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/tenants/${currentTenant.id}/connectors/${connectorId}/config`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        setSuccess('Connector configuration saved successfully');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentTenant || !user || !connectorId) return;
    if (!confirm('Are you sure you want to remove this connector configuration?')) return;

    setDeleting(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/tenants/${currentTenant.id}/connectors/${connectorId}/config`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        navigate('/admin/connectors');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete configuration');
      }
    } catch (err) {
      setError('Failed to delete configuration');
    } finally {
      setDeleting(false);
    }
  };

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
      </div>
    );
  }

  if (!connectorInfo) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Unknown Connector</h2>
        <Link to="/admin/connectors" className="text-blue-600 hover:underline">
          Back to Connectors
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to="/admin/connectors" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          &larr; Back to Connectors
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{connectorInfo.name} Configuration</h1>
        <p className="text-gray-600 mt-1">{connectorInfo.description}</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">{success}</div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 space-y-6">
          {/* Enabled Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-900">Enabled</label>
              <p className="text-sm text-gray-500">Enable this connector for your organization</p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Base URL */}
          {connectorInfo.defaultBaseUrl && (
            <div>
              <label className="block font-medium text-gray-900 mb-1">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={connectorInfo.defaultBaseUrl}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to use default: {connectorInfo.defaultBaseUrl}
              </p>
            </div>
          )}

          {/* Timeouts */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-gray-900 mb-1">Connect Timeout (ms)</label>
              <input
                type="number"
                value={connectMs}
                onChange={(e) => setConnectMs(Number(e.target.value))}
                min={1000}
                max={60000}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-900 mb-1">Read Timeout (ms)</label>
              <input
                type="number"
                value={readMs}
                onChange={(e) => setReadMs(Number(e.target.value))}
                min={1000}
                max={300000}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {/* Rate Limit */}
          <div>
            <label className="block font-medium text-gray-900 mb-1">Rate Limit (requests/minute)</label>
            <input
              type="number"
              value={requestsPerMinute}
              onChange={(e) => setRequestsPerMinute(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="No limit"
              min={1}
              max={1000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty for no rate limiting</p>
          </div>

          {/* Secret References */}
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Secrets</h3>
            <p className="text-sm text-gray-500 mb-3">
              Enter secret references (e.g., env://MY_TOKEN or gcp://secret-name)
            </p>
            <div className="space-y-3">
              {connectorInfo.secretFields.map((field) => (
                <div key={field}>
                  <label className="block text-sm text-gray-700 mb-1">{field}</label>
                  <input
                    type="text"
                    value={secretRefs[field] || ''}
                    onChange={(e) => setSecretRefs({ ...secretRefs, [field]: e.target.value })}
                    placeholder={`env://${field}`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between">
          {config && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              {deleting ? 'Removing...' : 'Remove Configuration'}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 ml-auto"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
