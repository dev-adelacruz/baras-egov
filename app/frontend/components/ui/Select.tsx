import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Visible label text. Bound to the control via `htmlFor`/`id`. */
  label: string;
  /** Required — the label needs it, and it anchors `aria-describedby`. */
  id: string;
  /** Marks the control invalid and points it at the error region. */
  invalid?: boolean;
  /** id of the element describing the error, when `invalid`. */
  describedBy?: string;
  /**
   * Renders the label to assistive technology only. For a filter bar, where a
   * stacked label costs a whole row and the first option already names the
   * control ("All offices"). The `<label>` is still real and still bound —
   * this hides it, it does not drop it (BRGY-119).
   */
  srOnlyLabel?: boolean;
  children: React.ReactNode;
}

// Deliberately mirrors Input.tsx's FIELD string. A select that sits beside a
// text input in the same grid and is 2px shorter, or a different radius, is the
// kind of drift BRGY-129 was filed for — so the two share their geometry.
const FIELD =
  'w-full pl-4 pr-10 py-2.5 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl ' +
  'appearance-none transition-all duration-150 disabled:opacity-50 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-600 focus:bg-white focus:border-transparent';

/**
 * Labelled select — the counterpart to `Input`, and the reason a form can use
 * real `<label>` elements throughout instead of `aria-label` on half its
 * fields. `appearance-none` plus an explicit chevron because the native arrow
 * renders differently on each platform and would not match the field's radius.
 */
const Select: React.FC<SelectProps> = ({
  label,
  id,
  invalid = false,
  describedBy,
  srOnlyLabel = false,
  className = '',
  children,
  ...rest
}) => (
  <div className={srOnlyLabel ? '' : 'space-y-1.5'}>
    <label
      htmlFor={id}
      className={
        srOnlyLabel
          ? 'sr-only'
          : 'block text-xs font-semibold text-slate-600 uppercase tracking-wider'
      }
    >
      {label}
    </label>
    <div className="relative">
      <select
        {...rest}
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? describedBy : undefined}
        className={`${FIELD} ${className}`.trim()}
      >
        {children}
      </select>
      <ChevronDown
        className="absolute w-4 h-4 text-slate-400 top-1/2 -translate-y-1/2 right-3.5 pointer-events-none"
        aria-hidden="true"
      />
    </div>
  </div>
);

export default Select;
