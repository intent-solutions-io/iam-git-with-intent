/**
 * App Component
 *
 * Root component with routing and providers.
 */


import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Runs } from './pages/Runs';
import { RunDetail } from './pages/RunDetail';
import { Settings } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { InviteAccept } from './pages/InviteAccept';
// Phase 12: Admin pages
import { AdminPolicy } from './pages/AdminPolicy';
import { AdminConnectors } from './pages/AdminConnectors';
import { AdminConnectorConfig } from './pages/AdminConnectorConfig';
import { AdminSecrets } from './pages/AdminSecrets';
// Phase 13: Templates + Instances
import { Templates } from './pages/Templates';
import { Instances } from './pages/Instances';
import { InstanceDetail } from './pages/InstanceDetail';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />
            <Route path="/invite/:token" element={<InviteAccept />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/runs"
              element={
                <ProtectedRoute>
                  <Runs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/runs/:runId"
              element={
                <ProtectedRoute>
                  <RunDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            {/* Phase 12: Admin routes */}
            <Route
              path="/admin/policy"
              element={
                <ProtectedRoute>
                  <AdminPolicy />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/connectors"
              element={
                <ProtectedRoute>
                  <AdminConnectors />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/connectors/:connectorId"
              element={
                <ProtectedRoute>
                  <AdminConnectorConfig />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/secrets"
              element={
                <ProtectedRoute>
                  <AdminSecrets />
                </ProtectedRoute>
              }
            />
            {/* Phase 13: Templates + Instances */}
            <Route
              path="/templates"
              element={
                <ProtectedRoute>
                  <Templates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instances"
              element={
                <ProtectedRoute>
                  <Instances />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instances/:instanceId"
              element={
                <ProtectedRoute>
                  <InstanceDetail />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
