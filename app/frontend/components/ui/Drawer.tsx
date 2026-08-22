import React from 'react';
import Overlay from './Overlay';

/**
 * Right-side panel. Use it for **detail views** — a record opened from a row,
 * where keeping the list visible is genuinely useful and the content is long
 * enough to fill a full-height panel (BRGY-133's account detail/edit view).
 *
 * Not for short forms. A drawer is full-height by definition, so a four-field
 * form leaves a fifth of the panel empty; use `Dialog size="form"` there. That
 * call was made by building both and measuring them — see Dialog.tsx.
 *
 * Also backs the mobile navigation in AppLayout, which previously hand-rolled
 * its own overlay with no `role="dialog"`, no `aria-modal`, no focus trap and
 * no Escape.
 */

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  hideClose?: boolean;
  /** Widen for denser content. Defaults to 30rem. */
  width?: 'default' | 'wide';
  testId?: string;
}

const WIDTHS: Record<'default' | 'wide', string> = {
  default: 'sm:max-w-[30rem]',
  wide: 'sm:max-w-[40rem]',
};

const Drawer: React.FC<DrawerProps> = ({ width = 'default', ...props }) => (
  <Overlay
    {...props}
    containerClassName="fixed inset-0 z-50 flex justify-end"
    panelClassName={`
      w-full h-full rounded-none
      animate-panel-slide-up sm:animate-panel-slide-right
      ${WIDTHS[width]}
    `}
  />
);

export default Drawer;
