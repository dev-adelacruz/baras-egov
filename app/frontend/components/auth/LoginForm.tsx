import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../state/store';
import { loginUser, fetchCurrentUser, clearError } from '../../state/user/userSlice';
import { Mail, Lock, ArrowRight, AlertCircle, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { TEXT_LINK } from '../ui/linkStyles';
import type { LoginFailureKind } from '../../services/authService';

interface LoginFormProps {
  onSuccess: () => void;
}

/**
 * Not every sign-in failure is the same kind of problem, and they should not
 * look the same.
 *
 * `last-attempt` is a warning about a consequence that has not happened yet —
 * it is the last moment the user can avoid an hour locked out, so it must read
 * as an escalation rather than as the same red box they just dismissed.
 * `locked` is a state they cannot fix by retyping, so it gets the padlock
 * rather than the generic alert glyph.
 */
const errorBanner = (kind: LoginFailureKind | null) => {
  if (kind === 'last-attempt') {
    return {
      className: 'bg-warning-50 border-warning-200 text-warning-800',
      Icon: AlertTriangle,
    };
  }
  return {
    className: 'bg-danger-50 border-danger-200 text-danger-700',
    Icon: kind === 'locked' ? Lock : AlertCircle,
  };
};

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error, errorKind } = useSelector((state: RootState) => state.user);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const displayError = error;
  const banner = errorBanner(errorKind);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(clearError());

    const result = await dispatch(loginUser({ email, password, rememberMe }));

    if (loginUser.fulfilled.match(result)) {
      // Load role/permissions before entering the app so nav renders correctly.
      await dispatch(fetchCurrentUser());
      onSuccess();
    }
    // On rejection the slice records both the copy and the failure kind, so
    // there is no second source of truth to keep in step here.
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
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${banner.className}`}
        >
          <banner.Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
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
          placeholder="name@barangay.gov.ph"
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
          <Link to="/forgot-password" className={`text-sm ${TEXT_LINK}`}>
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
