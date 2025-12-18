/**
 * Settings Page
 *
 * Tenant and repository configuration.
 */

import { useState } from 'react';
import { useTenant } from '../hooks/useTenant';

export function Settings() {
  const { currentTenant, loading } = useTenant();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!currentTenant) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          No Organization Selected
        </h2>
        <p className="text-gray-600">
          Select an organization to view settings.
        </p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // TODO: Implement settings save
      await new Promise((resolve) => setTimeout(resolve, 500));
      setMessage('Settings saved successfully');
    } catch {
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {message && (
        <div
          className={`mb-4 p-3 rounded-md ${
            message.includes('success')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message}
        </div>
      )}

      {/* Organization Settings */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Organization
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={currentTenant.name}
              disabled
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plan
            </label>
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
                {currentTenant.plan}
              </span>
              <a
                href="#"
                className="text-sm text-blue-600 hover:underline"
              >
                Upgrade plan
              </a>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              GitHub Installation ID
            </label>
            <input
              type="text"
              value={currentTenant.installationId}
              disabled
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50 text-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Default Settings */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Default Risk Mode
        </h2>

        <div className="space-y-3">
          <label className="flex items-start space-x-3 p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="riskMode"
              value="conservative"
              defaultChecked
              className="mt-1"
            />
            <div>
              <div className="font-medium text-gray-900">Conservative</div>
              <div className="text-sm text-gray-600">
                Always require human approval before applying resolutions
              </div>
            </div>
          </label>

          <label className="flex items-start space-x-3 p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="riskMode"
              value="balanced"
              className="mt-1"
            />
            <div>
              <div className="font-medium text-gray-900">Balanced</div>
              <div className="text-sm text-gray-600">
                Auto-apply low-risk resolutions, require approval for complex ones
              </div>
            </div>
          </label>

          <label className="flex items-start space-x-3 p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="riskMode"
              value="aggressive"
              className="mt-1"
            />
            <div>
              <div className="font-medium text-gray-900">Aggressive</div>
              <div className="text-sm text-gray-600">
                Auto-apply all resolutions with high confidence scores
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Auto-Triage */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Auto-Triage
        </h2>

        <label className="flex items-center space-x-3">
          <input type="checkbox" defaultChecked className="rounded" />
          <div>
            <div className="font-medium text-gray-900">
              Enable automatic triage
            </div>
            <div className="text-sm text-gray-600">
              Automatically analyze PRs when conflicts are detected
            </div>
          </div>
        </label>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gray-900 text-white px-4 py-2 rounded-md font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
