import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

/**
 * A row-anchored actions menu (BRGY-120).
 *
 * Exists so a destructive action can live *behind* a neutral trigger. Forty
 * "Deactivate" links rendered a vertical stripe of the error colour down the
 * right edge of the accounts table, which meant the strongest repeated signal
 * on a page listing colleagues was "destroy". Red belongs to the opened menu,
 * not to the resting page.
 *
 * Deliberately not built on `useOverlay`: that hook locks body scroll and traps
 * focus, which is right for a modal and wrong for a menu. A menu is a transient
 * layer — it closes on Escape, on outside click, on Tab, and on scroll.
 */

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Destructive items get the danger treatment — only ever inside the panel. */
  tone?: 'default' | 'danger';
  icon?: React.ReactNode;
}

export interface MenuProps {
  /** Accessible name for the trigger. Names the row: "Actions for x@y.gov". */
  label: string;
  items: MenuItem[];
  testId?: string;
}

const PANEL_GAP = 6;
const PANEL_WIDTH = 224;

const Menu: React.FC<MenuProps> = ({ label, items, testId }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setCoords(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const openAt = (index: number) => {
    setActive(index);
    setOpen(true);
  };

  // Fixed coordinates measured from the trigger, because the panel is
  // portalled. The accounts table sits in an `overflow-x-auto` wrapper, and a
  // scroll container clips on both axes — an absolutely positioned panel inside
  // it would be cut off at the row, which is the failure this avoids entirely.
  // Places the panel against the trigger's current position. Returns false when
  // the trigger has scrolled out of view, which is the one case where the menu
  // should give up rather than follow.
  const place = useCallback((): boolean => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return true;

    const t = trigger.getBoundingClientRect();
    // Only give up on a trigger that has a real box and is outside the viewport.
    // A zero-size rect means layout is unknown, not that the trigger has
    // scrolled away — treating the two as the same made the menu unopenable
    // anywhere without a layout engine, which is every unit test.
    const laidOut = t.width > 0 || t.height > 0;
    if (laidOut && (t.bottom <= 0 || t.top >= window.innerHeight)) return false;

    // Measured, not assumed. The panel is already mounted (hidden, parked
    // off-screen) precisely so this height is real on the first pass — an
    // earlier cut gated the portal on `coords`, so the only measurement that
    // mattered read 0 and the flip below could never trigger.
    const height = panel.offsetHeight;
    const below = t.bottom + PANEL_GAP;
    // Flip above when there is no room below. Without it the menu on the last
    // row of a 40-row table opens past the bottom of the viewport.
    const flip = below + height > window.innerHeight && t.top - height - PANEL_GAP > 0;

    setCoords({
      top: flip ? t.top - height - PANEL_GAP : below,
      left: Math.max(8, Math.min(t.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8)),
    });
    return true;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, items.length, place]);

  useEffect(() => {
    if (!open || !coords) return undefined;
    // preventScroll is load-bearing, not a nicety. Focusing an item on a row
    // near the bottom of a long page makes the browser scroll it into view,
    // which fires the scroll handler below and closes the menu a frame after
    // it opened — the menu flashed and vanished on the last rows of the table.
    itemRefs.current[active]?.focus({ preventScroll: true });
    return undefined;
  }, [open, active, coords]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    // Re-placed, not closed.
    //
    // Closing on any scroll looks reasonable and is a race: a scroll is
    // dispatched on the frame *after* the scrolling happens, so a scroll that
    // was already in flight when the menu opened arrives just after this
    // listener attaches and closes the menu immediately. Clicking a row's menu
    // on a long table did nothing at all — the panel opened and vanished within
    // a frame. Trackpad momentum reproduces it for a real user; Playwright
    // reproduced it by scrolling to reach the bottom rows.
    //
    // Following the trigger removes the race rather than papering over it with
    // a timeout, and is better behaviour anyway. The menu only gives up when
    // its row has actually left the viewport.
    const onScrollOrResize = () => {
      if (!place()) close(false);
    };

    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('touchstart', onPointerDown, true);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, close, place]);

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(items.length - 1);
    }
  };

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case 'Tab':
        // A menu is not a focus trap — Tab dismisses it and lets focus move on.
        close(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => (i + 1) % items.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(items.length - 1);
        break;
      default:
        break;
    }
  };

  const choose = (item: MenuItem) => {
    close();
    item.onSelect();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid={testId}
        onClick={() => (open ? close() : openAt(0))}
        onKeyDown={onTriggerKeyDown}
        // 36px at rest clears WCAG 2.2 2.5.8's 24px floor with room to spare;
        // 44px on a coarse pointer meets the touch target guidance. The old
        // control was a 62x16 text link, which met neither.
        className="inline-flex items-center justify-center w-9 h-9 pointer-coarse:w-11 pointer-coarse:h-11 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onPanelKeyDown}
            // Mounted before it is placed, parked off-screen and hidden for the
            // one frame it takes to measure. Rendering it only once `coords`
            // existed made its own height unmeasurable.
            style={{
              position: 'fixed',
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              width: PANEL_WIDTH,
              visibility: coords ? 'visible' : 'hidden',
            }}
            className="z-50 py-1 bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-900/10"
          >
            {items.map((item, i) => (
              <button
                key={item.label}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                // Stated as data so "is this item destructive" is assertable
                // without a test having to know which Tailwind token paints it.
                data-tone={item.tone ?? 'default'}
                tabIndex={i === active ? 0 : -1}
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium transition-colors focus:outline-none ${
                  item.tone === 'danger'
                    ? 'text-danger-700 hover:bg-danger-50 focus:bg-danger-50'
                    : 'text-slate-700 hover:bg-slate-50 focus:bg-slate-50'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};

export default Menu;
