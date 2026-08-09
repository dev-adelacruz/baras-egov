import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, ArrowLeft, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { authService } from '../../services/authService';

const ResetPasswordForm: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('reset_password_token') ?? '';

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('This reset link is invalid or has expired. Please request a new one.');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await authService.resetPassword({ token, password, passwordConfirmation });
      navigate('/login', {
        replace: true,
        state: { notice: 'Your password has been reset. Please sign in with your new password.' },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Choose a new password</h2>
        <p className="mt-1.5 text-sm text-slate-500">Enter and confirm your new password below.</p>
      </div>

      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
            New password
          </label>
          <div className="relative">
            <Lock className="absolute w-4 h-4 text-slate-400 top-1/2 -translate-y-1/2 left-3.5 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={isLoading}
              placeholder="••••••••"
              className="w-full pl-10 pr-10 py-2.5 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white focus:border-transparent transition-all duration-150 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="passwordConfirmation" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Confirm new password
          </label>
          <div className="relative">
            <Lock className="absolute w-4 h-4 text-slate-400 top-1/2 -translate-y-1/2 left-3.5 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              id="passwordConfirmation"
              autoComplete="new-password"
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              required
              minLength={6}
              disabled={isLoading}
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-2.5 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white focus:border-transparent transition-all duration-150 disabled:opacity-50"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center justify-center w-full px-4 py-2.5 mt-2 text-sm font-semibold text-white bg-teal-700 rounded-xl hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 shadow-md shadow-teal-600/20 enabled:hover:shadow-lg enabled:hover:shadow-teal-600/30"
        >
          {isLoading ? 'Resetting...' : 'Reset password'}
        </button>
      </form>

      <Link
        to="/login"
        className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to sign in
      </Link>
    </div>
  );
};

export default ResetPasswordForm;
