/**
 * Login Page
 *
 * Multi-provider authentication: GitHub OAuth, Google OAuth, Email/Password.
 */

import { useState } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { user, loading, signInWithGitHub, signInWithGoogle, signInWithEmail } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from
    ?.pathname || '/dashboard';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleGitHubLogin = async () => {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGitHub();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to sign in with GitHub'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to sign in with Google'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSigningIn(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to sign in with email'
      );
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
          Sign in to Git With Intent
        </h1>
        <p className="text-gray-600 text-center mb-6">
          Connect your GitHub account to get started
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        {!showEmailForm ? (
          <>
            {/* OAuth Providers */}
            <button
              onClick={handleGitHubLogin}
              disabled={signingIn}
              className="w-full flex items-center justify-center space-x-2 bg-gray-900 text-white px-4 py-3 rounded-md font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
            >
              {signingIn ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Continue with GitHub</span>
                </>
              )}
            </button>

            <button
              onClick={handleGoogleLogin}
              disabled={signingIn}
              className="w-full flex items-center justify-center space-x-2 bg-white text-gray-700 px-4 py-3 rounded-md font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>

            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full text-center text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              Sign in with email
            </button>
          </>
        ) : (
          <>
            {/* Email/Password Form */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <button
                type="submit"
                disabled={signingIn}
                className="w-full bg-gray-900 text-white px-4 py-3 rounded-md font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {signingIn ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <button
              onClick={() => setShowEmailForm(false)}
              className="w-full mt-4 text-center text-sm text-gray-600 hover:text-gray-900"
            >
              Back to other options
            </button>

            <p className="mt-4 text-sm text-center text-gray-600">
              Don't have an account?{' '}
              <Link to="/signup" className="text-blue-600 hover:underline">
                Sign up
              </Link>
            </p>
          </>
        )}

        <p className="mt-4 text-xs text-gray-500 text-center">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
