import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, RefreshCw } from 'lucide-react';
import Dialog from '../ui/Dialog';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import {
  adminUserService,
  AdminUser,
  ASSIGNABLE_ROLES,
  OFFICE_MODULES,
} from '../../services/adminUserService';

/**
 * Create-account form as a modal (BRGY-129).
 *
 * Replaces an inline form that opened *above* the accounts table, displacing it
 * by 213px at 1440 and 374px at 390. That form had no title, no labels (five
 * grey placeholders on grey fills — it read as disabled at rest), no cancel,
 * and a submit button with the exact geometry of the text field beside it, so
 * the last row parsed as two fields rather than a field and an action.
 *
 * Everything here is deliberate about not reintroducing those:
 * fields come from `Input`/`Select` so a real `<label>` is structural rather
 * than optional, and the actions live in the dialog footer where `Overlay`
 * tints and rules them off from the field grid.
 */

const MIN_PASSWORD_LENGTH = 6;

// Omits I/l/1/O/0 — this string gets read off a screen and typed by hand, or
// dictated over a phone, so the pairs that look alike in most UI faces are out.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const GENERATED_LENGTH = 14;

const generatePassword = (): string => {
  const bytes = new Uint32Array(GENERATED_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join('');
};

const humanize = (value: string): string =>
  value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldName = 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;

const emptyForm = {
  email: '',
  password: '',
  // Least privilege, and named rather than taken as ASSIGNABLE_ROLES[0] — that
  // index is `admin`, so an untouched form would provision an administrator.
  // Whoever is creating the account has to choose to elevate it.
  role: 'municipal_staff',
  office: OFFICE_MODULES[0],
};

/**
 * Maps a server rejection onto the field at fault.
 *
 * The API returns `errors.full_messages.to_sentence` as one string, so there is
 * no per-field structure to read — the attribute name is only recoverable from
 * the message's leading word. Anything that doesn't name a field we own stays
 * at dialog level rather than being pinned to the wrong input.
 */
const attributeServerError = (message: string): { field?: FieldName; message: string } => {
  if (/^email/i.test(message)) return { field: 'email', message };
  if (/^password/i.test(message)) return { field: 'password', message };
  return { message };
};

export interface CreateAccountDialogProps {
  open: boolean;
  onClose: () => void;
  /** Emails already on the list, for the pre-flight duplicate check. */
  existingEmails: string[];
  /** Fired after a successful create so the caller can refresh its list. */
  onCreated: (user: AdminUser) => void;
}

const CreateAccountDialog: React.FC<CreateAccountDialogProps> = ({
  open,
  onClose,
  existingEmails,
  onCreated,
}) => {
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [focusField, setFocusField] = useState<FieldName | null>(null);

  // Focus is requested as state, then applied here, rather than called inline
  // where the error is set. On the server-rejection path `isSubmitting` is
  // still true at that point, so the field is rendered disabled and focusing it
  // is a no-op — the field-level error appeared but a keyboard user was left on
  // the submit button. Running it after the render that re-enables the field
  // fixes both paths with one mechanism.
  useEffect(() => {
    if (!focusField) return;
    document.getElementById(`create-account-${focusField}`)?.focus();
    setFocusField(null);
  }, [focusField]);

  // Reset on open rather than on close: resetting on close would blank the
  // success panel out from under the admin while they are still reading the
  // password off it.
  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(false);
    setCreated(null);
    setCopied(false);
    setFocusField(null);
  }, [open]);

  const takenEmails = useMemo(
    () => new Set(existingEmails.map((e) => e.trim().toLowerCase())),
    [existingEmails]
  );

  const setField = (name: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear the error as soon as the field is touched — leaving it up while the
    // admin corrects the value makes a form that is now valid still look broken.
    setFieldErrors((prev) => (name in prev ? { ...prev, [name]: undefined } : prev));
  };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const email = form.email.trim();

    if (!email) {
      errors.email = 'Enter an email address.';
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.email = 'Enter a valid email address.';
    } else if (takenEmails.has(email.toLowerCase())) {
      // Checked here as well as server-side: the admin is looking at the list
      // that proves it, so making them wait for a round-trip to be told is
      // needless.
      errors.email = 'An account with this email already exists.';
    }

    if (!form.password) {
      errors.password = 'Enter a temporary password.';
    } else if (form.password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    return errors;
  };

  const handleSubmit = async () => {
    setFormError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFocusField(Object.keys(errors)[0] as FieldName);
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await adminUserService.create({
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        office: form.office,
      });
      setCreated({ email: form.email.trim(), password: form.password });
      onCreated(user);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to create account.';
      const { field, message } = attributeServerError(raw);
      if (field) {
        setFieldErrors({ [field]: message });
        setFocusField(field);
      } else {
        setFormError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
    } catch {
      // Clipboard access can be denied outright (permissions, insecure origin).
      // The password is on screen and selectable, so this is recoverable —
      // say so instead of leaving a button that silently does nothing.
      setFormError('Could not copy automatically. Select the password and copy it manually.');
    }
  };

  const fieldError = (name: FieldName) =>
    fieldErrors[name] ? (
      <p id={`create-account-${name}-error`} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-danger-700">
        <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
        {fieldErrors[name]}
      </p>
    ) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={created ? 'Account created' : 'New staff account'}
      description={
        created
          ? undefined
          : 'They sign in with the email and temporary password you set here.'
      }
      size="form"
      testId="create-account-dialog"
      footer={
        created ? (
          <Button fullWidth={false} onClick={onClose} data-autofocus>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" fullWidth={false} onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              fullWidth={false}
              onClick={handleSubmit}
              isLoading={isSubmitting}
              loadingLabel="Creating…"
            >
              Create account
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-900">{created.email}</span> can now sign in.
            Give them the temporary password below — {/* Deliberately not "they'll be
            asked to change it at first sign-in": forced rotation does not exist yet
            (BRGY-129 copy note). Do not promise it until it is built. */}
            it is not stored anywhere you can read it back.
          </p>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Temporary password
              </p>
              <p className="font-mono text-base text-slate-900 break-all select-all" data-testid="created-password">
                {created.password}
              </p>
            </div>
            <Button
              variant="secondary"
              fullWidth={false}
              onClick={handleCopy}
              // Overrides Button's 44px `py-3`: this sits inside a panel beside
              // the value it copies, not as a page-level action. Tailwind v4
              // spells the important modifier as a suffix, not a prefix.
              className="py-2!"
              aria-live="polite"
            >
              {copied ? (
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4" aria-hidden="true" />
                  Copied
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Copy className="w-4 h-4" aria-hidden="true" />
                  Copy password
                </span>
              )}
            </Button>
          </div>

          {formError && (
            <p role="alert" className="text-xs font-medium text-danger-700">
              {formError}
            </p>
          )}
        </div>
      ) : (
        // `noValidate` on purpose: native validation shows an OS-styled tooltip
        // on the first invalid field only, and it vanishes on the next click.
        // Every rule here renders against its own field and stays there.
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          {formError && (
            <div role="alert" className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-danger-50 border border-danger-200 text-danger-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm font-medium">{formError}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Input
              label="Email"
              id="create-account-email"
              type="email"
              // Not `email`: this is someone else's address, and offering the
              // signed-in admin's own saved address here is how the wrong person
              // gets provisioned.
              autoComplete="off"
              placeholder="juan.delacruz@example.gov.ph"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              invalid={Boolean(fieldErrors.email)}
              describedBy="create-account-email-error"
              disabled={isSubmitting}
              data-autofocus
            />
            {fieldError('email')}
          </div>

          <div className="space-y-1.5">
            <Input
              label="Temporary password"
              id="create-account-password"
              type="text"
              // `new-password` stops the admin's password manager offering to
              // autofill — or worse, save — their own credentials into a form
              // that provisions somebody else's account.
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              invalid={Boolean(fieldErrors.password)}
              describedBy="create-account-password-error"
              disabled={isSubmitting}
              trailing={
                <button
                  type="button"
                  onClick={() => setField('password', generatePassword())}
                  disabled={isSubmitting}
                  className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Generate
                </button>
              }
              // Room for the Generate control. Input's own `pr-10` assumes an
              // icon-sized trailing element and this one is a labelled button;
              // both set padding-right, so class order alone would not decide
              // it — hence the important modifier (a suffix in Tailwind v4).
              className="pr-28!"
            />
            {fieldError('password') ?? (
              // Stated up front, not after a failed submit — the old form kept
              // the 6-character rule invisible until it was violated.
              <p className="text-xs text-slate-500">
                At least {MIN_PASSWORD_LENGTH} characters. Shown once after you create the account.
              </p>
            )}
          </div>

          {/* Role and Office pair on one row: together they are a single
              decision — what this person is, and where they work. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Role"
              id="create-account-role"
              value={form.role}
              onChange={(e) => setField('role', e.target.value)}
              disabled={isSubmitting}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </Select>
            <Select
              label="Office"
              id="create-account-office"
              value={form.office}
              onChange={(e) => setField('office', e.target.value)}
              disabled={isSubmitting}
            >
              {OFFICE_MODULES.map((m) => (
                <option key={m} value={m}>
                  {humanize(m)}
                </option>
              ))}
            </Select>
          </div>
        </form>
      )}
    </Dialog>
  );
};

export default CreateAccountDialog;
