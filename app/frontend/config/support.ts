/**
 * Where a staff member goes when they cannot resolve a sign-in problem alone —
 * a locked account, a deactivated account, a forgotten address.
 *
 * `null` is a deliberate state, not an oversight. The real IT helpdesk address
 * has not been confirmed yet (BRGY-121). While this is null the UI renders
 * plain text instead of a control, so nothing focusable does nothing. Setting
 * it to an address turns that text into a mailto: link with no other change.
 *
 * Do NOT put a plausible-looking placeholder address here. A dead button wastes
 * a click; an invented address sends a locked-out person's request into nowhere
 * and they wait for a reply that never comes.
 */
export const SUPPORT_CONTACT: string | null = null;

/** `mailto:` href for the contact, or null when no contact is configured. */
export const supportMailto = (): string | null =>
  SUPPORT_CONTACT ? `mailto:${SUPPORT_CONTACT}` : null;
