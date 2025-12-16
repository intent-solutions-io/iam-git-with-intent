/**
 * Runs Page
 *
 * List of all runs for the current tenant.
 */

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTenant } from '../hooks/useTenant';

interface Run {
  id: string;
  type: 'resolve' | 'autopilot' | 'issue_to_pr';
  status: 'pending' | 'running' | 'completed' | 'failed';
  prUrl?: string;
  prNumber?: number;
  repoId: string;
  createdAt: Date;
  completedAt?: Date;
}

export function Runs() {
  const { currentTenant, loading: tenantLoading } = useTenant();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant) {
      setRuns([]);
      setLoading(false);
      return;
    }

    const runsQuery = query(
      collection(db, 'gwi_runs'),
      where('tenantId', '==', currentTenant.id),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      runsQuery,
      (snapshot) => {
        const fetchedRuns = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          completedAt: doc.data().completedAt?.toDate(),
        })) as Run[];

        setRuns(fetchedRuns);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching runs:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentTenant]);

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
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          No Organization Selected
        </h2>
        <p className="text-gray-600">
          Select an organization to view runs.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Runs</h1>
      </div>

      {runs.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No runs yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Runs will appear here when merge conflicts are detected on your PRs
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Run
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {run.prUrl ? (
                      <a
                        href={run.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        PR #{run.prNumber}
                      </a>
                    ) : (
                      <span className="text-gray-500">{run.id.slice(0, 8)}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <RunTypeBadge type={run.type} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {run.createdAt?.toLocaleString() || '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RunTypeBadge({ type }: { type: Run['type'] }) {
  const styles = {
    resolve: 'bg-blue-100 text-blue-800',
    autopilot: 'bg-purple-100 text-purple-800',
    issue_to_pr: 'bg-green-100 text-green-800',
  };

  const labels = {
    resolve: 'Resolve',
    autopilot: 'Autopilot',
    issue_to_pr: 'Issue to PR',
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function StatusBadge({ status }: { status: Run['status'] }) {
  const styles = {
    pending: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}
    >
      {status}
    </span>
  );
}
