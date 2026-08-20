import React from 'react';
import BrandMark, { PRODUCT_NAME } from '../ui/BrandMark';

interface AuthLayoutProps {
  children: React.ReactNode;
  /**
   * The wide brand panel. Only login supplies one; when present the inline
   * brand lockup hides at `lg` so the mark isn't shown twice.
   */
  aside?: React.ReactNode;
}

/**
 * Shared shell for every auth page. Previously login used a split-panel layout
 * and forgot/reset-password used a bare centred one — the same flow rendered
 * three different ways, drifting a little further apart with each edit.
 *
 * `min-h-dvh` rather than `min-h-screen`: 100vh excludes mobile browser chrome,
 * so the container never shrank when the keyboard opened (BRGY-102).
 */
const AuthLayout: React.FC<AuthLayoutProps> = ({ children, aside }) => (
  <div className="flex min-h-dvh">
    {aside}

    <div className="flex-1 flex flex-col items-center justify-center bg-white px-8 py-12 overflow-y-auto">
      <div className={`${aside ? 'lg:hidden ' : ''}mb-10`}>
        <BrandMark />
      </div>

      {/* max-w-md (448px), not max-w-sm (384px). On login this is the half of
          the screen doing the actual work, and 384px next to an 835px panel
          read as the secondary column. Applied in the shell rather than on
          login alone so the three auth pages keep the one shared measure.
          Mobile is unaffected — below 448px the cap never binds. */}
      <div className="w-full max-w-md">{children}</div>

      <p className="mt-12 text-xs text-slate-500">
        © {new Date().getFullYear()} {PRODUCT_NAME}. All rights reserved.
      </p>
    </div>
  </div>
);

export default AuthLayout;
