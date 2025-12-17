/**
 * Admin Secrets Page
 *
 * Phase 12: Minimal secret management UI.
 * Shows secret references only (never values after save).
 */

import { useState } from 'react';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface SecretEntry {
  ref: string;
  provider: string;
  name: string;
  hasValue: boolean;
}

export function AdminSecrets() {
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user: _user } = useAuth();
  const [secrets, setSecrets] = useState<SecretEntry[]>([
    // Mock data - in production would come from API
    { ref: 'env://GITHUB_TOKEN', provider: 'env', name: 'GITHUB_TOKEN', hasValue: true },
    { ref: 'env://ANTHROPIC_API_KEY', provider: 'env', name: 'ANTHROPIC_API_KEY', hasValue: true },
  ]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSecretRef, setNewSecretRef] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAddSecret = async () => {
    if (!newSecretRef || !newSecretValue) {
      setError('Both reference and value are required');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // In production, this would call the API to store the secret
      // For dev mode, it would create a file in .gwi/secrets/
      // For now, we just add to local state as a demo
      const provider = newSecretRef.split('://')[0] || 'dev';
      const name = newSecretRef.split('://')[1] || newSecretRef;

      setSecrets([
        ...secrets,
        { ref: newSecretRef, provider, name, hasValue: true },
      ]);

      setNewSecretRef('');
      setNewSecretValue('');
      setShowAddForm(false);
      setSuccess('Secret reference added. Value is never shown again after save.');
    } catch {
      setError('Failed to add secret');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSecret = async (ref: string) => {
    if (!confirm('Are you sure you want to delete this secret reference?')) {
      return;
    }

    setSecrets(secrets.filter((s) => s.ref !== ref));
    setSuccess('Secret reference removed');
  };

  if (tenantLoading) {
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
        <p className="text-gray-600">Select an organization to manage secrets.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Secrets</h1>
        <p className="text-gray-600 mt-1">
          Manage secret references for your organization. Values are never displayed after saving.
        </p>
      </div>

      {/* Security Notice */}
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="font-semibold text-yellow-800 mb-1">Security Notice</h3>
        <p className="text-sm text-yellow-700">
          Secret values are encrypted at rest and never exposed in the UI, API responses, or logs.
          Only secret references are shown. Use env:// for environment variables or gcp:// for
          GCP Secret Manager.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {success}
        </div>
      )}

      {/* Secrets List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">Secret References</h2>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Secret
          </button>
        </div>

        {secrets.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No secrets configured. Add a secret reference to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {secrets.map((secret) => (
              <div key={secret.ref} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      secret.provider === 'env'
                        ? 'bg-purple-100 text-purple-800'
                        : secret.provider === 'gcp'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {secret.provider}
                  </div>
                  <div>
                    <code className="text-sm text-gray-900">{secret.ref}</code>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {secret.hasValue ? 'Value stored' : 'No value'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteSecret(secret.ref)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Secret Form */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Secret</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secret Reference
                </label>
                <input
                  type="text"
                  value={newSecretRef}
                  onChange={(e) => setNewSecretRef(e.target.value)}
                  placeholder="dev://my_api_key or gcp://secret-name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Format: provider://name (e.g., dev://api_key, gcp://my-secret, env://TOKEN)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secret Value
                </label>
                <input
                  type="password"
                  value={newSecretValue}
                  onChange={(e) => setNewSecretValue(e.target.value)}
                  placeholder="Enter secret value..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This value will never be shown again after saving
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewSecretRef('');
                  setNewSecretValue('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSecret}
                disabled={saving || !newSecretRef || !newSecretValue}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Secret'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider Reference */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-2">Secret Provider Reference</h3>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            <strong>env://</strong> Environment variable (read-only, set in deployment config)
          </p>
          <p>
            <strong>dev://</strong> Local file storage (development only, stored in .gwi/secrets/)
          </p>
          <p>
            <strong>gcp://</strong> GCP Secret Manager (production, requires GCP_PROJECT_ID)
          </p>
        </div>
      </div>
    </div>
  );
}
