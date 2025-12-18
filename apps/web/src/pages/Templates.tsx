/**
 * Templates Page
 *
 * Phase 13: Browse available workflow templates
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface TemplateInfo {
  id: string;
  version: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  requiredConnectors: Array<{
    connectorType: string;
    label: string;
    required: boolean;
  }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  'code-generation': 'bg-blue-100 text-blue-800',
  'review': 'bg-purple-100 text-purple-800',
  'maintenance': 'bg-green-100 text-green-800',
  'analysis': 'bg-yellow-100 text-yellow-800',
  'custom': 'bg-gray-100 text-gray-800',
};

export function Templates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const token = await user.getIdToken();
        const url = new URL(`${import.meta.env.VITE_API_URL || ''}/v1/templates`);
        if (categoryFilter) {
          url.searchParams.set('category', categoryFilter);
        }

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates);
        } else {
          setError('Failed to load templates');
        }
      } catch (err) {
        setError('Failed to load templates');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, [user, categoryFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  const categories = ['code-generation', 'review', 'maintenance', 'analysis', 'custom'];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Workflow Templates</h1>
        <p className="text-gray-600 mt-1">
          Browse available workflow templates and create instances for your organization.
        </p>
      </div>

      {/* Category Filter */}
      <div className="mb-6 flex gap-2 flex-wrap">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`px-3 py-1 rounded-full text-sm ${
            categoryFilter === null
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1 rounded-full text-sm capitalize ${
              categoryFilter === cat
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cat.replace('-', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(template => (
          <div
            key={template.id}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-gray-900">{template.displayName}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[template.category] || 'bg-gray-100 text-gray-800'}`}>
                {template.category.replace('-', ' ')}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-3">{template.description}</p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1 mb-3">
              {template.tags.slice(0, 4).map(tag => (
                <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>

            {/* Required Connectors */}
            {template.requiredConnectors.length > 0 && (
              <div className="text-xs text-gray-500 mb-3">
                Requires: {template.requiredConnectors.map(c => c.label).join(', ')}
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-400">v{template.version}</span>
              <Link
                to={`/templates/${template.id}`}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                View Details
              </Link>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          No templates found. Check back later for new workflow templates.
        </div>
      )}
    </div>
  );
}
