import React from 'react';
import { Landmark } from 'lucide-react';

/**
 * Single source of truth for the product name. Four files used to spell it
 * out independently, which is why the placeholder survived everywhere at once.
 */
export const PRODUCT_NAME = 'Barangay Console';

interface BrandMarkProps {
  /** `md` is the large lockup in the brand panel; `sm` is everywhere else. */
  size?: 'sm' | 'md';
  /** `onDark` renders the wordmark in white for the brand panel. */
  onDark?: boolean;
}

const BrandMark: React.FC<BrandMarkProps> = ({ size = 'sm', onDark = false }) => (
  <div className="flex items-center gap-2.5">
    <div
      className={`${size === 'md' ? 'w-9 h-9 shadow-lg shadow-brand-900/60' : 'w-8 h-8'} rounded-xl bg-brand-600 flex items-center justify-center`}
    >
      <Landmark className={size === 'md' ? 'w-5 h-5 text-white' : 'w-4 h-4 text-white'} aria-hidden="true" />
    </div>
    <span
      className={`font-bold tracking-tight ${size === 'md' ? 'text-lg' : 'text-base'} ${onDark ? 'text-white' : 'text-slate-900'}`}
    >
      {PRODUCT_NAME}
    </span>
  </div>
);

export default BrandMark;
