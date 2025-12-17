/**
 * Admin Policy Page
 *
 * Phase 12: Policy-as-Code editor for tenant administrators.
 * Allows viewing, editing, and validating tenant policy documents.
 */

import { useEffect, useState } from 'react';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface PolicyRule {
  id: string;
  description?: string;
  effect: 'allow' | 'deny';
  priority: number;
  conditions?: {
    tenants?: string[];
    actors?: string[];
    actorTypes?: string[];
    sources?: string[];
    connectors?: string[];
    tools?: string[];
    policyClasses?: string[];
    resources?: string[];
  };
}

interface PolicyDocument {
  version: string;
  name: string;
  description?: string;
  defaultReadBehavior: 'allow' | 'deny';
  defaultWriteBehavior: 'allow' | 'deny';
  defaultDestructiveBehavior: 'deny';
  rules: PolicyRule[];
}

interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string; code: string }>;
  normalized: PolicyDocument | null;
  summary?: {
    rulesCount: number;
    allowRules: number;
    denyRules: number;
  };
}

export function AdminPolicy() {
  const { currentTenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [_policy, setPolicy] = useState<PolicyDocument | null>(null);
  const [policyJson, setPolicyJson] = useState('');
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTenant || !user) {
      setLoading(false);
      return;
    }

    const fetchPolicy = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || ''}/tenants/${currentTenant.id}/policy`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.policy) {
            setPolicy(data.policy);
            setPolicyJson(JSON.stringify(data.policy, null, 2));
            setVersion(data.version || 0);
          } else {
            // No policy - use default template
            const defaultPolicy: PolicyDocument = {
              version: '1.0',
              name: 'Default Policy',
              description: 'Organization security policy',
              defaultReadBehavior: 'allow',
              defaultWriteBehavior: 'deny',
              defaultDestructiveBehavior: 'deny',
              rules: [],
            };
            setPolicy(defaultPolicy);
            setPolicyJson(JSON.stringify(defaultPolicy, null, 2));
          }
        }
      } catch (err) {
        setError('Failed to load policy');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPolicy();
  }, [currentTenant, user]);

  const handleValidate = async () => {
    if (!currentTenant || !user) return;

    setValidating(true);
    setError(null);
    setValidation(null);

    try {
      const parsed = JSON.parse(policyJson);
      const token = await user.getIdToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/tenants/${currentTenant.id}/policy/validate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(parsed),
        }
      );

      const data = await res.json();
      setValidation(data);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setValidation({
          valid: false,
          errors: [{ path: '', message: 'Invalid JSON syntax', code: 'syntax_error' }],
          normalized: null,
        });
      } else {
        setError('Validation request failed');
      }
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!currentTenant || !user) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const parsed = JSON.parse(policyJson);
      const token = await user.getIdToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/tenants/${currentTenant.id}/policy`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(parsed),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setVersion(data.version);
        setPolicy(data.policy);
        setSuccess(`Policy saved successfully (v${data.version})`);
        setValidation(null);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save policy');
        if (data.validationErrors) {
          setValidation({
            valid: false,
            errors: data.validationErrors.map((e: string) => ({
              path: '',
              message: e,
              code: 'validation_error',
            })),
            normalized: null,
          });
        }
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON syntax');
      } else {
        setError('Failed to save policy');
      }
    } finally {
      setSaving(false);
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
        <p className="text-gray-600">Select an organization to manage policies.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Policy Editor</h1>
        <p className="text-gray-600 mt-1">
          Configure security policy for your organization (Version {version})
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {success}
        </div>
      )}

      {/* Validation Results */}
      {validation && (
        <div
          className={`mb-4 p-4 rounded-lg border ${
            validation.valid
              ? 'bg-green-50 border-green-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}
        >
          <h3 className={`font-semibold mb-2 ${validation.valid ? 'text-green-800' : 'text-yellow-800'}`}>
            {validation.valid ? 'Policy is valid' : 'Validation issues found'}
          </h3>
          {validation.summary && (
            <p className="text-sm text-gray-600 mb-2">
              {validation.summary.rulesCount} rules ({validation.summary.allowRules} allow,{' '}
              {validation.summary.denyRules} deny)
            </p>
          )}
          {validation.errors.length > 0 && (
            <ul className="text-sm space-y-1">
              {validation.errors.map((e, i) => (
                <li key={i} className="text-yellow-800">
                  {e.path ? `${e.path}: ` : ''}{e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Policy Editor */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">Policy Document (JSON)</h2>
          <div className="flex gap-2">
            <button
              onClick={handleValidate}
              disabled={validating}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {validating ? 'Validating...' : 'Validate'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Policy'}
            </button>
          </div>
        </div>
        <div className="p-4">
          <textarea
            value={policyJson}
            onChange={(e) => setPolicyJson(e.target.value)}
            className="w-full h-96 font-mono text-sm p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter policy JSON..."
          />
        </div>
      </div>

      {/* Policy Reference */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-2">Policy Reference</h3>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            <strong>defaultReadBehavior:</strong> Controls read operations (allow/deny)
          </p>
          <p>
            <strong>defaultWriteBehavior:</strong> Controls write operations (allow/deny)
          </p>
          <p>
            <strong>defaultDestructiveBehavior:</strong> Always "deny" for destructive operations
          </p>
          <p>
            <strong>rules:</strong> Array of policy rules with conditions and effects
          </p>
          <p className="mt-2">
            <a
              href="https://docs.gwi.dev/policies"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              View full documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
