import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Swaps the label for a spinner and disables the control. */
  isLoading?: boolean;
  /** Shown beside the spinner while `isLoading` — e.g. "Signing in...". */
  loadingLabel?: string;
  /**
   * Auth screens want a full-bleed submit; dialog footers want a button sized
   * to its label sitting beside a Cancel. Defaults to full width so every
   * existing caller keeps the shape it had before BRGY-126 added the variants.
   */
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  // Dark ink on the vibrant brand fill, not white. White on brand-500 is
  // 2.80:1 and fails AA outright; dropping to brand-700 to earn white text
  // would pass but costs the vibrancy the palette exists for. slate-900 on
  // brand-500 scores 6.17:1 and keeps the fill exactly as bright as the seal.
  // Hover darkens to brand-600, still 4.97:1.
  primary:
    'text-slate-900 bg-brand-500 hover:bg-brand-600 focus:ring-brand-600 ' +
    'shadow-md shadow-brand-600/20 enabled:hover:shadow-lg enabled:hover:shadow-brand-600/30',
  // The quiet half of a dialog footer. Bordered rather than ghost so it still
  // reads as a control next to a filled button.
  secondary:
    'text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 ' +
    'hover:text-slate-900 focus:ring-brand-600',
  // Destructive confirmations only, and only inside a dialog — never as a
  // resting-state control repeated down a table (that is BRGY-120's defect).
  // White on danger-600 is 4.83:1.
  danger:
    'text-white bg-danger-600 hover:bg-danger-700 focus:ring-danger-600 ' +
    'shadow-md shadow-danger-600/20',
};

// `py-3` — a 44px control (12 + 20 line-box + 12). `py-2.5` gave 40px, which
// cleared WCAG 2.2 2.5.8's 24px floor but sat under the 44px iOS target for a
// primary action, and on a phone this button is the whole task. Set here rather
// than per-page so login, forgot-password and reset-password move together.
const BASE =
  'group relative flex items-center justify-center px-4 py-3 rounded-xl ' +
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
  fullWidth = true,
  disabled,
  className = '',
  children,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || isLoading}
    className={`${BASE} ${fullWidth ? 'w-full' : ''} ${VARIANTS[variant]} ${className}`
      .replace(/\s+/g, ' ')
      .trim()}
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
