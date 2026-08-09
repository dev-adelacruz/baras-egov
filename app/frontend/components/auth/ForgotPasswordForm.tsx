import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authService } from '../../services/authService';
import Button from '../ui/Button';
import Input from '../ui/Input';

const BackToSignIn: React.FC = () => (
  <Link
    to="/login"
    className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800 transition-colors"
  >
    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
    Back to sign in
  </Link>
);

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
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-info-50 border border-info-200 text-info-700">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">
            If that email is registered, we've sent password reset instructions. Please check your inbox.
          </p>
        </div>
        <BackToSignIn />
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
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email address"
          id="email"
          type="email"
          icon={Mail}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
          placeholder="you@company.com"
        />

        <Button type="submit" isLoading={isLoading} loadingLabel="Sending..." className="mt-2">
          Send reset instructions
        </Button>
      </form>

      <BackToSignIn />
    </div>
  );
};

export default ForgotPasswordForm;
