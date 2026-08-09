import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Visible label text. Bound to the input via `htmlFor`/`id`. */
  label: string;
  /** Required — the label needs it, and it anchors `aria-describedby`. */
  id: string;
  /** Decorative leading glyph inside the field. */
  icon?: LucideIcon;
  /** Interactive element pinned to the right edge — e.g. a password toggle. */
  trailing?: React.ReactNode;
  /** Marks the field invalid and points it at the error region. */
  invalid?: boolean;
  /** id of the element describing the error, when `invalid`. */
  describedBy?: string;
}

const FIELD =
  'w-full py-2.5 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl ' +
  'placeholder:text-slate-500 transition-all duration-150 disabled:opacity-50 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-600 focus:bg-white focus:border-transparent';

/**
 * Labelled text field for the auth flow. Owns the label/aria wiring so the
 * accessibility fixes from BRGY-97/98 can't be reintroduced field-by-field.
 */
const Input: React.FC<InputProps> = ({
  label,
  id,
  icon: Icon,
  trailing,
  invalid = false,
  describedBy,
  className = '',
  ...rest
}) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
      {label}
    </label>
    <div className="relative">
      {Icon && (
        <Icon
          className="absolute w-4 h-4 text-slate-400 top-1/2 -translate-y-1/2 left-3.5 pointer-events-none"
          aria-hidden="true"
        />
      )}
      <input
        {...rest}
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? describedBy : undefined}
        className={`${FIELD} ${Icon ? 'pl-10' : 'pl-4'} ${trailing ? 'pr-10' : 'pr-4'} ${className}`.trim()}
      />
      {trailing}
    </div>
  </div>
);

export default Input;
