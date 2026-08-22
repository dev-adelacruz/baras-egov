import { useCallback, useEffect, useRef } from 'react';

/**
 * The behaviour half of an overlay: focus containment, focus return, Escape,
 * and body scroll lock (BRGY-126).
 *
 * Split out from `Overlay` so consumers that need the behaviour but not the
 * chrome can have it. The mobile navigation in `AppLayout` is one: it is a dark
 * full-height rail that is persistent at `lg` and an overlay below it, so it
 * cannot wear a white dialog's header and footer — but it still needs every
 * one of these guarantees, and hand-rolling them per consumer is how the app
 * ended up with a nav drawer that had none.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Mounted overlays, innermost last. Only the last one reacts to Escape. */
const openStack: symbol[] = [];

/**
 * Body scroll lock, reference-counted.
 *
 * Counted rather than a plain set/unset because two overlays can briefly
 * coexist during a swap (a confirmation opening from inside a drawer). Without
 * the count, the first to close would hand scrolling back to the page while the
 * second is still up.
 */
let scrollLocks = 0;
let restoreOverflow = '';

const lockScroll = () => {
  if (scrollLocks === 0) {
    restoreOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
};

const releaseScroll = () => {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = restoreOverflow;
};

export const visibleFocusable = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
  );

interface UseOverlayOptions {
  open: boolean;
  onClose: () => void;
  /** The element to trap focus within. */
  panelRef: React.RefObject<HTMLElement>;
}

export const useOverlay = ({ open, onClose, panelRef }: UseOverlayOptions): void => {
  const idRef = useRef<symbol>(Symbol('overlay'));
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== idRef.current) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      // React 18 has no `inert` prop (React 19 only), so containment is manual:
      // wrap from last back to first and vice versa. Without it Tab walks
      // straight out into the page behind the scrim — the same defect class
      // BRGY-124 had to patch by hand with `invisible`.
      const panel = panelRef.current;
      if (!panel) return;

      const items = visibleFocusable(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose, panelRef]
  );

  useEffect(() => {
    if (!open) return undefined;

    const id = idRef.current;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    openStack.push(id);
    lockScroll();
    document.addEventListener('keydown', handleKeyDown, true);

    // Move focus in. Prefer an explicitly marked control, else the first
    // focusable, else the panel itself — so a screen reader lands on the
    // overlay's own heading rather than staying on a trigger that is now
    // behind a scrim.
    const panel = panelRef.current;
    const preferred = panel?.querySelector<HTMLElement>('[data-autofocus]');
    (preferred ?? (panel ? visibleFocusable(panel)[0] : null) ?? panel)?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      releaseScroll();
      const at = openStack.indexOf(id);
      if (at !== -1) openStack.splice(at, 1);
      // Return focus to whatever opened this, so a keyboard user resumes where
      // they left off instead of at the top of the document.
      returnFocusRef.current?.focus?.();
    };
  }, [open, handleKeyDown, panelRef]);
};

export default useOverlay;
