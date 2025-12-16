/**
 * Dashboard Page
 *
 * Overview of tenant activity and recent runs.
 */


import { Link } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';

export function Dashboard() {
  const { currentTenant, loading } = useTenant();

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
          No Organization Found
        </h2>
        <p className="text-gray-600 mb-8">
          Install the Git With Intent GitHub App to get started.
        </p>
        <a
          href="https://github.com/apps/git-with-intent"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-gray-900 text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800"
        >
          Install GitHub App
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{currentTenant.name}</h1>
        <p className="text-gray-600">
          {currentTenant.type === 'organization' ? 'Organization' : 'Personal'}{' '}
          account &middot; {currentTenant.plan} plan
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Runs" value="--" />
        <StatCard title="This Week" value="--" />
        <StatCard title="Success Rate" value="--%" />
        <StatCard title="Active Repos" value="--" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/runs"
            className="p-4 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <h3 className="font-medium text-gray-900">View Runs</h3>
            <p className="text-sm text-gray-600">See all conflict resolutions</p>
          </Link>
          <Link
            to="/settings"
            className="p-4 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <h3 className="font-medium text-gray-900">Settings</h3>
            <p className="text-sm text-gray-600">Configure risk modes</p>
          </Link>
          <a
            href="https://github.com/apps/git-with-intent"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <h3 className="font-medium text-gray-900">Add Repositories</h3>
            <p className="text-sm text-gray-600">Manage GitHub App access</p>
          </a>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Activity
        </h2>
        <div className="text-center py-8 text-gray-500">
          <p>No recent activity</p>
          <p className="text-sm mt-1">
            Runs will appear here once conflicts are detected on PRs
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-600">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
