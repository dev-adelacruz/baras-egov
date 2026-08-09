import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../state/store';
import { loginUser, fetchCurrentUser, clearError } from '../../state/user/userSlice';
import { Mail, Lock, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface LoginFormProps {
  onSuccess: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error } = useSelector((state: RootState) => state.user);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = localError || error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    dispatch(clearError());

    const result = await dispatch(loginUser({ email, password, rememberMe }));

    if (loginUser.fulfilled.match(result)) {
      // Load role/permissions before entering the app so nav renders correctly.
      await dispatch(fetchCurrentUser());
      onSuccess();
    } else if (loginUser.rejected.match(result)) {
      // authService translates every failure into user-facing copy, so the
      // payload is rendered as-is; the guard only covers a dispatch that
      // rejected without one.
      setLocalError((result.payload as string) || 'Could not sign you in. Try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Sign in to your account</h2>
        <p className="mt-1.5 text-sm text-slate-500">Enter your credentials to access the dashboard.</p>
      </div>

      {displayError && (
        <div
          role="alert"
          id="login-error"
          className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">{displayError}</p>
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
          invalid={Boolean(displayError)}
          describedBy="login-error"
          placeholder="you@company.com"
        />

        <Input
          label="Password"
          id="password"
          type={showPassword ? 'text' : 'password'}
          icon={Lock}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          invalid={Boolean(displayError)}
          describedBy="login-error"
          placeholder="••••••••"
          trailing={
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

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isLoading}
              // accent-color is the one property a native checkbox honours for
              // its checked fill. The previous text-/bg-/border- utilities did
              // nothing here without @tailwindcss/forms, which is not installed.
              className="w-4 h-4 accent-brand-700 rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-1"
            />
            <span className="text-sm text-slate-600">Remember me</span>
          </label>
          <Link to="/forgot-password" className="text-sm font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-150">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" isLoading={isLoading} loadingLabel="Signing in..." className="mt-2">
          <span className="flex items-center gap-2">
            Sign in
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-150" aria-hidden="true" />
          </span>
        </Button>
      </form>
    </div>
  );
};

export default LoginForm;
