import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useOverlay } from './useOverlay';

/**
 * The chrome shared by `Dialog` and `Drawer` (BRGY-126): portal, scrim, and a
 * title/body/footer frame. Behaviour lives in `useOverlay`.
 *
 * Before this existed the app had no overlay primitive at all — a grep for
 * `role="dialog"`, `aria-modal`, `<dialog>`, `createPortal`, `Modal`, `Drawer`
 * or `Sheet` across `app/frontend` returned two hits, both the word "drawer" in
 * a comment. Every consumer that needed one either hand-rolled it (the mobile
 * nav in AppLayout) or did without — which is why deactivating a colleague on
 * /admin/users is currently one unconfirmed click.
 *
 * Not exported for direct use. Reach for `Dialog`, `ConfirmDialog` or `Drawer`.
 */

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /** Renders as the overlay's heading and names it for assistive tech. */
  title: string;
  /** Optional line under the title. */
  description?: string;
  /** Pinned below the body, visually separated. Put the actions here. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /**
   * `alertdialog` for a decision that must be resolved before continuing —
   * confirmations. `dialog` for everything else.
   */
  role?: 'dialog' | 'alertdialog';
  /** Hides the header's × — use only when a footer action is the sole exit. */
  hideClose?: boolean;
  /** Positioning + sizing, supplied by Dialog/Drawer. */
  panelClassName: string;
  /** Wrapper that positions the panel within the viewport. */
  containerClassName: string;
  /** Marks the panel for tests and for consumers that need to scope queries. */
  testId?: string;
}

const Overlay: React.FC<OverlayProps> = ({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  role = 'dialog',
  hideClose = false,
  panelClassName,
  containerClassName,
  testId,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const descId = `${instanceId}-desc`;

  useOverlay({ open, onClose, panelRef });

  if (!open) return null;

  return createPortal(
    <div className={containerClassName}>
      {/*
        Scrim. `onMouseDown` rather than `onClick`: a drag that starts inside the
        panel (selecting text in a field) and ends on the scrim would otherwise
        dismiss the overlay and discard what was typed.

        `preventDefault` is load-bearing, not tidiness. mousedown's default
        action moves focus, and it runs *after* this handler — so without it the
        browser blanks the focus `useOverlay` just restored to the trigger.
        Measured before the guard: Escape-close returned focus to the trigger,
        scrim-close left `document.activeElement` null.
      */}
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] animate-overlay-fade"
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          onClose();
        }}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        data-testid={testId}
        className={`relative flex flex-col bg-white shadow-2xl focus:outline-none ${panelClassName}`
          .replace(/\s+/g, ' ')
          .trim()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-slate-900 tracking-tight">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-slate-500 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {!hideClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* The body scrolls; the header and footer do not. Long content must
            never push the actions off the bottom of the viewport. */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">{children}</div>

        {footer && (
          // Tinted and ruled off so the actions read as actions. The defect this
          // guards against is BRGY-129's: a submit button dropped into the field
          // grid, identical in width, height and radius to the input beside it.
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Overlay;
