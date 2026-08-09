import React from 'react';

type ButtonVariant = 'primary';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Swaps the label for a spinner and disables the control. */
  isLoading?: boolean;
  /** Shown beside the spinner while `isLoading` — e.g. "Signing in...". */
  loadingLabel?: string;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'text-white bg-brand-700 hover:bg-brand-800 focus:ring-brand-600 ' +
    'shadow-md shadow-brand-600/20 enabled:hover:shadow-lg enabled:hover:shadow-brand-600/30',
};

const BASE =
  'group relative flex items-center justify-center w-full px-4 py-2.5 rounded-xl ' +
  'text-sm font-semibold transition-all duration-150 ' +
  'focus:outline-none focus:ring-2 focus:ring-offset-2 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';

/**
 * The one submit button for the auth flow. Extracted because login,
 * forgot-password and reset-password each carried their own copy of the same
 * 14-utility class string, which is how they drifted apart in the first place.
 */
const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  isLoading = false,
  loadingLabel,
  disabled,
  className = '',
  children,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || isLoading}
    className={`${BASE} ${VARIANTS[variant]} ${className}`.trim()}
  >
    {isLoading ? (
      <span className="flex items-center gap-2">
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        {loadingLabel}
      </span>
    ) : (
      children
    )}
  </button>
);

export default Button;
