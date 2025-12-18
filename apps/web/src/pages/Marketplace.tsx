/**
 * Marketplace Page
 *
 * Phase 29: Connector marketplace for browsing and installing connectors.
 * Connects to registry API for search and connector info.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
// Note: useTenant and useAuth are available for authenticated features
// import { useTenant } from '../hooks/useTenant';
// import { useAuth } from '../contexts/AuthContext';

interface MarketplaceConnector {
  id: string;
  latestVersion: string;
  displayName: string;
  description: string;
  author: string;
  capabilities: string[];
  downloads: number;
  updatedAt: string;
}

interface SearchResult {
  connectors: MarketplaceConnector[];
  total: number;
  page: number;
  pageSize: number;
}

const CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'version-control', name: 'Version Control' },
  { id: 'ci-cd', name: 'CI/CD' },
  { id: 'monitoring', name: 'Monitoring' },
  { id: 'project-management', name: 'Project Management' },
  { id: 'communication', name: 'Communication' },
  { id: 'security', name: 'Security' },
  { id: 'data', name: 'Data' },
];

const SORT_OPTIONS = [
  { id: 'downloads', name: 'Most Popular' },
  { id: 'updated', name: 'Recently Updated' },
  { id: 'name', name: 'Alphabetical' },
];

export function Marketplace() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [connectors, setConnectors] = useState<MarketplaceConnector[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'downloads');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));

  const registryUrl = import.meta.env.VITE_REGISTRY_URL || '/api/v1';

  const fetchConnectors = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (category !== 'all') params.set('categories', category);
      params.set('sortBy', sortBy);
      params.set('page', page.toString());
      params.set('pageSize', '20');

      const res = await fetch(`${registryUrl}/search?${params}`);
      if (!res.ok) {
        throw new Error(`Search failed: ${res.statusText}`);
      }

      const data: SearchResult = await res.json();
      setConnectors(data.connectors);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connectors');
      console.error('Marketplace search error:', err);
    } finally {
      setLoading(false);
    }
  }, [registryUrl, searchQuery, category, sortBy, page]);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (category !== 'all') params.set('category', category);
    if (sortBy !== 'downloads') params.set('sort', sortBy);
    if (page > 1) params.set('page', page.toString());
    setSearchParams(params);
  }, [searchQuery, category, sortBy, page, setSearchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchConnectors();
  };

  const formatDownloads = (downloads: number): string => {
    if (downloads >= 1000000) return `${(downloads / 1000000).toFixed(1)}M`;
    if (downloads >= 1000) return `${(downloads / 1000).toFixed(1)}K`;
    return downloads.toString();
  };

  const getCapabilityBadge = (cap: string): { bg: string; text: string } => {
    const badges: Record<string, { bg: string; text: string }> = {
      vcs: { bg: 'bg-purple-100', text: 'text-purple-800' },
      'ci-cd': { bg: 'bg-blue-100', text: 'text-blue-800' },
      'issue-tracking': { bg: 'bg-green-100', text: 'text-green-800' },
      messaging: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      monitoring: { bg: 'bg-red-100', text: 'text-red-800' },
      auth: { bg: 'bg-gray-100', text: 'text-gray-800' },
    };
    return badges[cap] || { bg: 'bg-gray-100', text: 'text-gray-700' };
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Connector Marketplace</h1>
        <p className="text-gray-600 mt-2">
          Browse and install connectors to extend your Git With Intent workflows
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <form onSubmit={handleSearch} className="flex gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search connectors..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-4">
          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Category:</span>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : connectors.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <div className="text-4xl mb-4">📦</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No connectors found</h2>
          <p className="text-gray-600">
            {searchQuery
              ? `No connectors match "${searchQuery}"`
              : 'No connectors available in this category'}
          </p>
        </div>
      ) : (
        <>
          {/* Results count */}
          <div className="mb-4 text-sm text-gray-500">
            Showing {connectors.length} of {total} connectors
          </div>

          {/* Connector Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectors.map((connector) => (
              <Link
                key={connector.id}
                to={`/marketplace/${connector.id}`}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {connector.displayName}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {connector.id}@{connector.latestVersion}
                      </p>
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatDownloads(connector.downloads)} installs
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {connector.description || 'No description available'}
                  </p>

                  <div className="flex flex-wrap gap-1">
                    {connector.capabilities.slice(0, 3).map((cap) => {
                      const badge = getCapabilityBadge(cap);
                      return (
                        <span
                          key={cap}
                          className={`px-2 py-0.5 text-xs rounded ${badge.bg} ${badge.text}`}
                        >
                          {cap}
                        </span>
                      );
                    })}
                    {connector.capabilities.length > 3 && (
                      <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                        +{connector.capabilities.length - 3}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-500">by {connector.author}</span>
                    <span className="text-blue-600 text-sm">View details →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-600">
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= Math.ceil(total / 20)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Footer info */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>
          Want to publish your own connector?{' '}
          <a
            href="https://docs.gitwithintent.com/connectors/publishing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Read the publishing guide
          </a>
        </p>
      </div>
    </div>
  );
}
