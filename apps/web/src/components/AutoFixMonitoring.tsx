/**
 * Auto-Fix Monitoring Dashboard
 *
 * Displays real-time metrics and trends for auto-fix quality
 */

import React, { useState, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

interface AutoFixMetrics {
  totalRuns: number;
  successRate: number;
  averageGrade: string;
  averageScore: number;
  averageDuration: number;
  costPerFix: number;
  trends: {
    period: string;
    runs: number;
    successRate: number;
    avgScore: number;
  }[];
  recentRuns: {
    id: string;
    issueNumber: number;
    prUrl: string;
    grade: string;
    score: number;
    status: string;
    createdAt: string;
    duration: number;
  }[];
  gradeDistribution: {
    A: number;
    B: number;
    C: number;
    D: number;
    F: number;
  };
}

// ============================================================================
// Components
// ============================================================================

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
  className?: string;
}> = ({ title, value, subtitle, trend, className = '' }) => {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor = trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-600';

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{title}</h3>
      <div className="mt-2 flex items-baseline">
        <p className="text-3xl font-semibold text-gray-900">{value}</p>
        {trend && (
          <span className={`ml-2 text-sm font-medium ${trendColor}`}>
            {trendIcon}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
    </div>
  );
};

const GradeChart: React.FC<{ distribution: AutoFixMetrics['gradeDistribution'] }> = ({ distribution }) => {
  const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);

  const gradeColors: Record<string, string> = {
    A: 'bg-green-500',
    B: 'bg-blue-500',
    C: 'bg-yellow-500',
    D: 'bg-orange-500',
    F: 'bg-red-500',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Grade Distribution</h3>
      <div className="space-y-3">
        {(Object.entries(distribution) as [keyof typeof distribution, number][]).map(([grade, count]) => {
          const percentage = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={grade} className="flex items-center">
              <span className="w-8 text-sm font-medium text-gray-700">{grade}</span>
              <div className="flex-1 mx-3 bg-gray-200 rounded-full h-6 overflow-hidden">
                <div
                  className={`${gradeColors[grade]} h-full flex items-center justify-end px-2 text-white text-xs font-medium transition-all duration-500`}
                  style={{ width: `${percentage}%` }}
                >
                  {percentage > 10 && `${percentage.toFixed(0)}%`}
                </div>
              </div>
              <span className="w-12 text-right text-sm text-gray-600">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TrendChart: React.FC<{ trends: AutoFixMetrics['trends'] }> = ({ trends }) => {
  const maxScore = Math.max(...trends.map(t => t.avgScore), 100);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Score Trend (Last 7 Days)</h3>
      <div className="h-48 flex items-end space-x-2">
        {trends.map((trend, idx) => {
          const height = (trend.avgScore / maxScore) * 100;
          const color = trend.avgScore >= 80 ? 'bg-green-500' : trend.avgScore >= 60 ? 'bg-yellow-500' : 'bg-red-500';

          return (
            <div key={idx} className="flex-1 flex flex-col items-center">
              <div className="w-full relative group">
                <div
                  className={`${color} rounded-t transition-all duration-500 hover:opacity-80 cursor-pointer`}
                  style={{ height: `${height * 1.5}px` }}
                />
                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Score: {trend.avgScore.toFixed(1)}<br />
                  Runs: {trend.runs}
                </div>
              </div>
              <span className="text-xs text-gray-500 mt-2">{trend.period}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RecentRunsTable: React.FC<{ runs: AutoFixMetrics['recentRuns'] }> = ({ runs }) => {
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'text-green-700 bg-green-100';
      case 'B': return 'text-blue-700 bg-blue-100';
      case 'C': return 'text-yellow-700 bg-yellow-100';
      case 'D': return 'text-orange-700 bg-orange-100';
      case 'F': return 'text-red-700 bg-red-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'success' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50';
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Recent Auto-Fix Runs</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issue</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grade</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PR</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  #{run.issueNumber}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(run.status)}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-bold rounded ${getGradeColor(run.grade)}`}>
                    {run.grade}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {run.score.toFixed(0)}/100
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {(run.duration / 1000).toFixed(1)}s
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(run.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {run.prUrl ? (
                    <a href={run.prUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                      View PR
                    </a>
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const AutoFixMonitoring: React.FC = () => {
  const [metrics, setMetrics] = useState<AutoFixMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      // In production, fetch from API
      // const response = await fetch('/api/auto-fix/metrics');
      // const data = await response.json();

      // Mock data for development
      const mockData: AutoFixMetrics = {
        totalRuns: 156,
        successRate: 87.2,
        averageGrade: 'B+',
        averageScore: 83.5,
        averageDuration: 45200,
        costPerFix: 0.08,
        trends: [
          { period: 'Mon', runs: 12, successRate: 83.3, avgScore: 81.2 },
          { period: 'Tue', runs: 18, successRate: 88.9, avgScore: 84.5 },
          { period: 'Wed', runs: 22, successRate: 86.4, avgScore: 83.1 },
          { period: 'Thu', runs: 25, successRate: 88.0, avgScore: 85.3 },
          { period: 'Fri', runs: 30, successRate: 90.0, avgScore: 86.7 },
          { period: 'Sat', runs: 15, successRate: 86.7, avgScore: 82.9 },
          { period: 'Sun', runs: 10, successRate: 80.0, avgScore: 79.5 },
        ],
        recentRuns: [
          { id: '1', issueNumber: 425, prUrl: '#', grade: 'A', score: 92, status: 'success', createdAt: new Date().toISOString(), duration: 38000 },
          { id: '2', issueNumber: 424, prUrl: '#', grade: 'B', score: 85, status: 'success', createdAt: new Date().toISOString(), duration: 42000 },
          { id: '3', issueNumber: 423, prUrl: '#', grade: 'B', score: 81, status: 'success', createdAt: new Date().toISOString(), duration: 51000 },
          { id: '4', issueNumber: 422, prUrl: '', grade: 'F', score: 45, status: 'failure', createdAt: new Date().toISOString(), duration: 15000 },
          { id: '5', issueNumber: 421, prUrl: '#', grade: 'A', score: 94, status: 'success', createdAt: new Date().toISOString(), duration: 36000 },
        ],
        gradeDistribution: {
          A: 45,
          B: 62,
          C: 28,
          D: 12,
          F: 9,
        },
      };

      setMetrics(mockData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    const poll = async () => {
      await fetchMetrics();
      // Schedule next poll only after current one completes (prevents overlapping)
      if (isMounted && autoRefresh) {
        timeoutId = setTimeout(poll, 30000); // Refresh every 30s
      }
    };

    // Start first poll after initial delay
    timeoutId = setTimeout(poll, 30000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [autoRefresh]);

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-medium">Error Loading Metrics</h3>
        <p className="text-red-600 mt-2">{error}</p>
        <button
          onClick={fetchMetrics}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Auto-Fix Monitoring</h1>
          <p className="mt-2 text-gray-600">Real-time quality metrics and trends</p>
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Auto-refresh</span>
          </label>
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Runs"
          value={metrics.totalRuns}
          trend="up"
        />
        <MetricCard
          title="Success Rate"
          value={`${metrics.successRate.toFixed(1)}%`}
          trend={metrics.successRate >= 85 ? 'up' : 'down'}
        />
        <MetricCard
          title="Average Grade"
          value={metrics.averageGrade}
          subtitle={`Score: ${metrics.averageScore.toFixed(1)}/100`}
          trend="stable"
        />
        <MetricCard
          title="Avg Cost"
          value={`$${metrics.costPerFix.toFixed(3)}`}
          subtitle={`Duration: ${(metrics.averageDuration / 1000).toFixed(1)}s`}
          trend="down"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendChart trends={metrics.trends} />
        <GradeChart distribution={metrics.gradeDistribution} />
      </div>

      {/* Recent Runs */}
      <RecentRunsTable runs={metrics.recentRuns} />
    </div>
  );
};

export default AutoFixMonitoring;
