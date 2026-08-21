import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, ArrowLeft, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { authService } from '../../services/authService';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { TEXT_LINK } from '../ui/linkStyles';

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
        {/* h1 — this page has no brand panel, so it had no heading above h2. */}
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-slate-500">Enter and confirm your new password below.</p>
      </div>

      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="New password"
          id="password"
          type={showPassword ? 'text' : 'password'}
          icon={Lock}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          disabled={isLoading}
          placeholder="••••••••"
          trailing={
            // Same defect BRGY-93 fixed on login: tabIndex={-1} plus no
            // accessible name made this toggle keyboard-unreachable. Corrected
            // here rather than left behind while the surrounding lines move.
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 -m-1 rounded text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-600 transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          }
        />

        <Input
          label="Confirm new password"
          id="passwordConfirmation"
          type={showPassword ? 'text' : 'password'}
          icon={Lock}
          autoComplete="new-password"
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          required
          minLength={6}
          disabled={isLoading}
          placeholder="••••••••"
        />

        <Button type="submit" isLoading={isLoading} loadingLabel="Resetting..." className="mt-2">
          Reset password
        </Button>
      </form>

      <Link
        to="/login"
        // Same 20px → 26px lift as the identical link in ForgotPasswordForm.
        // The two are duplicated markup, which is why this one was missed on
        // the first pass — worth extracting, but not in an a11y fix.
        className={`inline-flex items-center gap-2 text-sm py-1.5 ${TEXT_LINK}`}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to sign in
      </Link>
    </div>
  );
};

export default ResetPasswordForm;
