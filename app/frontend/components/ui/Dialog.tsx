import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Overlay from './Overlay';
import Button from './Button';

/**
 * Centred modal. The default for forms and confirmations alike (BRGY-126).
 *
 * `size="form"` was originally going to be a right-side Drawer. Both were built
 * and measured against the same four-field create form: the drawer left 187px
 * of void below the last field (20.8% of the panel) because it is full-height
 * by definition, against 22px for the modal, which sizes to its content. The
 * modal's extra width also lets related fields pair into columns. A drawer also
 * reads as "inspect this row" in most design languages, and creating an account
 * is not anchored to a row.
 *
 * `Drawer` remains the right pattern for the account detail view, which is
 * row-anchored and carries more content.
 */

export type DialogSize = 'compact' | 'form';

const SIZES: Record<DialogSize, string> = {
  /** One decision, a sentence of context. Confirmations. */
  compact: 'sm:max-w-[26.875rem]',
  /** ~560px — fits two columns of fields without the line length running long. */
  form: 'sm:max-w-[35rem]',
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: DialogSize;
  footer?: React.ReactNode;
  children: React.ReactNode;
  role?: 'dialog' | 'alertdialog';
  hideClose?: boolean;
  testId?: string;
}

const Dialog: React.FC<DialogProps> = ({ size = 'form', ...props }) => (
  <Overlay
    {...props}
    // Below `sm` this is a full-screen sheet, not a centred card. A centred box
    // with a mobile keyboard over it is the failure mode this primitive exists
    // to prevent — see BRGY-128, where /admin/users is already unusable at 390px.
    containerClassName="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4"
    panelClassName={`
      w-full h-full rounded-none
      sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl
      animate-panel-slide-up sm:animate-panel-rise
      ${SIZES[size]}
    `}
  />
);

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** What will happen, in plain language, naming the thing it happens to. */
  description: string;
  /**
   * Names the action — "Deactivate account", never "OK" or "Confirm". The user
   * must be able to act on the button without re-reading the title.
   */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions get the danger fill and a warning glyph. */
  tone?: 'default' | 'danger';
  isConfirming?: boolean;
  testId?: string;
}

/**
 * The confirmation every destructive action on /admin/users is currently
 * missing. Deactivating a colleague, changing someone's role and the
 * self-lockout guard (BRGY-120, BRGY-119, BRGY-127) all need exactly this
 * shape, so it lives here rather than being rebuilt three times.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  isConfirming = false,
  testId,
}) => (
  <Dialog
    open={open}
    onClose={onClose}
    title={title}
    size="compact"
    // alertdialog, not dialog: this interrupts a task and must be resolved
    // before anything else happens.
    role="alertdialog"
    testId={testId}
    footer={
      <>
        <Button variant="secondary" fullWidth={false} onClick={onClose} disabled={isConfirming}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          fullWidth={false}
          onClick={onConfirm}
          isLoading={isConfirming}
          loadingLabel="Working…"
          data-autofocus
        >
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className="flex gap-4">
      {tone === 'danger' && (
        <div className="shrink-0 w-10 h-10 rounded-xl bg-danger-50 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-danger-600" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm text-slate-600 leading-relaxed pt-1.5">{description}</p>
    </div>
  </Dialog>
);

export default Dialog;
