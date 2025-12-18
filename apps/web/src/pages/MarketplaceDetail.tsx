/**
 * Marketplace Detail Page
 *
 * Phase 29: Connector detail view with installation.
 * Shows connector info, versions, and install button.
 */

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../contexts/AuthContext';

interface ConnectorInfo {
  id: string;
  displayName: string;
  description: string;
  author: string;
  capabilities: string[];
  latestVersion: string;
  versions: string[];
  totalDownloads: number;
  repositoryUrl?: string;
  documentationUrl?: string;
  license: string;
  createdAt: string;
  updatedAt: string;
}

interface VersionInfo {
  id: string;
  version: string;
  manifest: {
    displayName: string;
    description?: string;
    capabilities: string[];
  };
  tarballUrl: string;
  tarballChecksum: string;
  publishedAt: string;
  downloads: number;
  deprecated: boolean;
  deprecationReason?: string;
  prerelease: boolean;
  changelog?: string;
  releaseNotes?: string;
}

interface Installation {
  connectorId: string;
  version: string;
  status: string;
  installedAt: string;
}

export function MarketplaceDetail() {
  const { connectorId } = useParams<{ connectorId: string }>();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [connector, setConnector] = useState<ConnectorInfo | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<VersionInfo | null>(null);
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  const registryUrl = import.meta.env.VITE_REGISTRY_URL || '/api/v1';
  const apiUrl = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    if (!connectorId) return;

    const fetchConnector = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch connector info
        const res = await fetch(`${registryUrl}/connectors/${connectorId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Connector not found');
          } else {
            throw new Error(`Failed to load connector: ${res.statusText}`);
          }
          return;
        }

        const data: ConnectorInfo = await res.json();
        setConnector(data);

        // Fetch latest version details
        const versionRes = await fetch(
          `${registryUrl}/connectors/${connectorId}/${data.latestVersion}`
        );
        if (versionRes.ok) {
          setSelectedVersion(await versionRes.json());
        }

        // Check if already installed (if authenticated)
        if (currentTenant && user) {
          try {
            const token = await user.getIdToken();
            const installRes = await fetch(
              `${apiUrl}/tenants/${currentTenant.id}/connectors/${connectorId}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (installRes.ok) {
              const installData = await installRes.json();
              setInstallation(installData.installation);
            }
          } catch {
            // Ignore - not installed
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load connector');
        console.error('Marketplace detail error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchConnector();
  }, [connectorId, registryUrl, apiUrl, currentTenant, user]);

  const handleInstall = async () => {
    if (!connector || !currentTenant || !user) return;

    setInstalling(true);
    setInstallError(null);

    try {
      const token = await user.getIdToken();
      const version = selectedVersion?.version || connector.latestVersion;

      const res = await fetch(`${apiUrl}/tenants/${currentTenant.id}/connectors/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          connectorId: connector.id,
          version,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Installation failed');
      }

      // Update installation state
      setInstallation({
        connectorId: connector.id,
        version,
        status: 'installed',
        installedAt: new Date().toISOString(),
      });

      // Navigate to connector config
      navigate(`/admin/connectors/${connector.id}`);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Installation failed');
    } finally {
      setInstalling(false);
    }
  };

  const handleVersionSelect = async (version: string) => {
    if (!connectorId) return;

    try {
      const res = await fetch(`${registryUrl}/connectors/${connectorId}/${version}`);
      if (res.ok) {
        setSelectedVersion(await res.json());
      }
    } catch {
      // Ignore
    }
    setShowVersions(false);
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDownloads = (downloads: number): string => {
    if (downloads >= 1000000) return `${(downloads / 1000000).toFixed(1)}M`;
    if (downloads >= 1000) return `${(downloads / 1000).toFixed(1)}K`;
    return downloads.toString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !connector) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <div className="text-4xl mb-4">📦</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {error || 'Connector not found'}
        </h2>
        <p className="text-gray-600 mb-4">
          The connector you're looking for doesn't exist or has been removed.
        </p>
        <Link
          to="/marketplace"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Back to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link to="/marketplace" className="text-blue-600 hover:underline">
          Marketplace
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600">{connector.displayName}</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {connector.displayName}
            </h1>
            <p className="text-gray-500 mb-4">{connector.id}</p>
            <p className="text-gray-700">{connector.description}</p>

            {/* Capabilities */}
            <div className="flex flex-wrap gap-2 mt-4">
              {connector.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>

          {/* Install Section */}
          <div className="ml-6 text-right">
            {installation ? (
              <div>
                <span className="inline-block px-4 py-2 bg-green-100 text-green-800 rounded-lg">
                  Installed v{installation.version}
                </span>
                <Link
                  to={`/admin/connectors/${connector.id}`}
                  className="block mt-2 text-sm text-blue-600 hover:underline"
                >
                  Configure →
                </Link>
              </div>
            ) : currentTenant ? (
              <div>
                <div className="relative inline-block mb-2">
                  <button
                    onClick={() => setShowVersions(!showVersions)}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    v{selectedVersion?.version || connector.latestVersion} ▼
                  </button>
                  {showVersions && (
                    <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                      {connector.versions.map((v) => (
                        <button
                          key={v}
                          onClick={() => handleVersionSelect(v)}
                          className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                            v === connector.latestVersion ? 'font-semibold' : ''
                          }`}
                        >
                          v{v}
                          {v === connector.latestVersion && (
                            <span className="text-xs text-green-600 ml-1">(latest)</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="block w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {installing ? 'Installing...' : 'Install'}
                </button>
                {installError && (
                  <p className="mt-2 text-sm text-red-600">{installError}</p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-2">Sign in to install</p>
                <Link
                  to="/login"
                  className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Stats */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Statistics</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Downloads</span>
              <span className="font-semibold">{formatDownloads(connector.totalDownloads)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Latest Version</span>
              <span className="font-semibold">v{connector.latestVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Versions</span>
              <span className="font-semibold">{connector.versions.length}</span>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Metadata</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Author</span>
              <span className="font-medium">{connector.author}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">License</span>
              <span className="font-medium">{connector.license || 'MIT'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Updated</span>
              <span className="font-medium">{formatDate(connector.updatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Links</h3>
          <div className="space-y-2">
            {connector.repositoryUrl && (
              <a
                href={connector.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-blue-600 hover:underline text-sm"
              >
                Repository →
              </a>
            )}
            {connector.documentationUrl && (
              <a
                href={connector.documentationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-blue-600 hover:underline text-sm"
              >
                Documentation →
              </a>
            )}
            <a
              href={`${registryUrl}/connectors/${connector.id}/${connector.latestVersion}/tarball`}
              className="block text-blue-600 hover:underline text-sm"
            >
              Download Tarball →
            </a>
          </div>
        </div>
      </div>

      {/* Version Info */}
      {selectedVersion && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Version {selectedVersion.version}
            {selectedVersion.prerelease && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">
                Pre-release
              </span>
            )}
            {selectedVersion.deprecated && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded">
                Deprecated
              </span>
            )}
          </h2>

          {selectedVersion.deprecated && selectedVersion.deprecationReason && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              <strong>Deprecation Notice:</strong> {selectedVersion.deprecationReason}
            </div>
          )}

          {selectedVersion.releaseNotes && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Release Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {selectedVersion.releaseNotes}
              </p>
            </div>
          )}

          {selectedVersion.changelog && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Changelog</h3>
              <pre className="text-sm text-gray-600 bg-gray-50 p-3 rounded overflow-x-auto">
                {selectedVersion.changelog}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>Published {formatDate(selectedVersion.publishedAt)}</span>
            <span>•</span>
            <span>{formatDownloads(selectedVersion.downloads)} downloads</span>
            <span>•</span>
            <span title={selectedVersion.tarballChecksum}>
              SHA256: {selectedVersion.tarballChecksum.slice(0, 12)}...
            </span>
          </div>
        </div>
      )}

      {/* All Versions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">All Versions</h2>
        <div className="space-y-2">
          {connector.versions.map((version) => (
            <div
              key={version}
              className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
            >
              <button
                onClick={() => handleVersionSelect(version)}
                className="text-blue-600 hover:underline"
              >
                v{version}
              </button>
              <div className="flex items-center gap-2">
                {version === connector.latestVersion && (
                  <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">
                    Latest
                  </span>
                )}
                {version === selectedVersion?.version && (
                  <span className="text-xs text-gray-500">Selected</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
