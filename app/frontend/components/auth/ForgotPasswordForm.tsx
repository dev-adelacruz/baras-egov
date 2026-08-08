import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authService } from '../../services/authService';

const ForgotPasswordForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await authService.requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-sm font-medium">
            If that email is registered, we've sent password reset instructions. Please check your inbox.
          </p>
        </div>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Reset your password</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Enter your email and we'll send you instructions to reset your password.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute w-4 h-4 text-slate-400 top-1/2 -translate-y-1/2 left-3.5 pointer-events-none" />
            <input
              type="email"
              id="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              placeholder="you@company.com"
              className="w-full pl-10 pr-4 py-2.5 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white focus:border-transparent transition-all duration-150 disabled:opacity-50"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center justify-center w-full px-4 py-2.5 mt-2 text-sm font-semibold text-white bg-teal-700 rounded-xl hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 shadow-lg shadow-teal-600/30"
        >
          {isLoading ? 'Sending...' : 'Send reset instructions'}
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

export default ForgotPasswordForm;
