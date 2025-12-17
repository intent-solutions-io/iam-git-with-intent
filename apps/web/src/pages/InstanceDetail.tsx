/**
 * Instance Detail Page
 *
 * Phase 13: Configure and run workflow instances
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface InstanceDetail {
  id: string;
  tenantId: string;
  templateRef: string;
  name: string;
  description?: string;
  configuredInputs: Record<string, unknown>;
  connectorBindings: Array<{ requirementId: string; connectorConfigId: string }>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastRunAt?: string;
  runCount: number;
}

interface ScheduleInfo {
  id: string;
  instanceId: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  nextTriggerAt?: string;
}

export function InstanceDetail() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const { user } = useAuth();
  const [instance, setInstance] = useState<InstanceDetail | null>(null);
  const [schedules, setSchedules] = useState<ScheduleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Schedule form state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [cronExpression, setCronExpression] = useState('0 8 * * 1-5');
  const [timezone, setTimezone] = useState('UTC');
  const [creatingSchedule, setCreatingSchedule] = useState(false);

  useEffect(() => {
    if (!user || !instanceId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const token = await user.getIdToken();

        // Fetch instance
        const instanceRes = await fetch(
          `${import.meta.env.VITE_API_URL || ''}/v1/instances/${instanceId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (instanceRes.ok) {
          const instanceData = await instanceRes.json();
          setInstance(instanceData);

          // Fetch schedules
          const schedulesRes = await fetch(
            `${import.meta.env.VITE_API_URL || ''}/v1/instances/${instanceId}/schedules`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (schedulesRes.ok) {
            const schedulesData = await schedulesRes.json();
            setSchedules(schedulesData.schedules);
          }
        } else if (instanceRes.status === 404) {
          setError('Instance not found');
        } else {
          setError('Failed to load instance');
        }
      } catch (err) {
        setError('Failed to load instance');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, instanceId]);

  const handleRunNow = async () => {
    if (!user || !instanceId) return;

    setRunning(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/v1/instances/${instanceId}/run`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setSuccess(`Run started: ${data.runId}`);
        // Update instance stats locally
        if (instance) {
          setInstance({
            ...instance,
            runCount: instance.runCount + 1,
            lastRunAt: new Date().toISOString(),
          });
        }
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to start run');
      }
    } catch {
      setError('Failed to start run');
    } finally {
      setRunning(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!user || !instanceId) return;

    setCreatingSchedule(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/v1/instances/${instanceId}/schedules`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cronExpression,
            timezone,
            enabled: true,
          }),
        }
      );

      if (res.ok) {
        const schedule = await res.json();
        setSchedules([...schedules, schedule]);
        setShowScheduleForm(false);
        setCronExpression('0 8 * * 1-5');
        setSuccess('Schedule created');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create schedule');
      }
    } catch {
      setError('Failed to create schedule');
    } finally {
      setCreatingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!user || !confirm('Delete this schedule?')) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/v1/schedules/${scheduleId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        setSchedules(schedules.filter(s => s.id !== scheduleId));
        setSuccess('Schedule deleted');
      } else {
        setError('Failed to delete schedule');
      }
    } catch {
      setError('Failed to delete schedule');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Instance Not Found</h2>
        <Link to="/instances" className="text-blue-600 hover:underline">
          Back to Instances
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link to="/instances" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          &larr; Back to Instances
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{instance.name}</h1>
            <p className="text-gray-600 mt-1">{instance.description || 'No description'}</p>
          </div>
          <button
            onClick={handleRunNow}
            disabled={running || !instance.enabled}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? 'Starting...' : 'Run Now'}
          </button>
        </div>
      </div>

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

      {/* Instance Info */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Instance Details</h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-gray-500">Template</dt>
            <dd className="text-sm font-medium text-gray-900">{instance.templateRef}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Status</dt>
            <dd>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  instance.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}
              >
                {instance.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Total Runs</dt>
            <dd className="text-sm font-medium text-gray-900">{instance.runCount}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Last Run</dt>
            <dd className="text-sm font-medium text-gray-900">
              {instance.lastRunAt ? new Date(instance.lastRunAt).toLocaleString() : 'Never'}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Created</dt>
            <dd className="text-sm font-medium text-gray-900">
              {new Date(instance.createdAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Created By</dt>
            <dd className="text-sm font-medium text-gray-900">{instance.createdBy}</dd>
          </div>
        </dl>
      </div>

      {/* Configured Inputs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Configuration</h2>
        <pre className="bg-gray-50 p-4 rounded text-sm overflow-auto">
          {JSON.stringify(instance.configuredInputs, null, 2)}
        </pre>
      </div>

      {/* Schedules */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">Schedules</h2>
          <button
            onClick={() => setShowScheduleForm(true)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            + Add Schedule
          </button>
        </div>

        {schedules.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No schedules configured. Add a schedule to run this workflow automatically.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {schedules.map(schedule => (
              <div key={schedule.id} className="p-4 flex items-center justify-between">
                <div>
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                    {schedule.cronExpression}
                  </code>
                  <span className="text-sm text-gray-500 ml-2">({schedule.timezone})</span>
                  <div className="text-xs text-gray-400 mt-1">
                    Next: {schedule.nextTriggerAt ? new Date(schedule.nextTriggerAt).toLocaleString() : 'N/A'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      schedule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {schedule.enabled ? 'Active' : 'Paused'}
                  </span>
                  <button
                    onClick={() => handleDeleteSchedule(schedule.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Schedule Modal */}
      {showScheduleForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Schedule</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cron Expression
                </label>
                <input
                  type="text"
                  value={cronExpression}
                  onChange={e => setCronExpression(e.target.value)}
                  placeholder="0 8 * * 1-5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Format: minute hour day-of-month month day-of-week
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Chicago">America/Chicago</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Berlin">Europe/Berlin</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowScheduleForm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSchedule}
                disabled={creatingSchedule || !cronExpression}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingSchedule ? 'Creating...' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
