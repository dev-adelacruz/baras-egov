/**
 * Where a staff member goes when they cannot resolve a sign-in problem alone —
 * a locked account, a deactivated account, a forgotten address.
 *
 * `null` remains a supported state: while null the UI renders plain text rather
 * than a control, so nothing focusable does nothing.
 *
 * `.local` is not a routable TLD — it is reserved for multicast DNS — so mail
 * sent here does not leave the network. That matches the rest of this
 * environment (`db/seeds.rb` issues accounts at `@barangay.gov.local`) and is
 * correct for development, but it is NOT a working destination in production.
 * BRGY-121 stays open until a monitored, routable address replaces it.
 *
 * Whatever replaces it must be read by someone who can actually unlock accounts
 * and reset passwords. An address nobody monitors reproduces the dead-control
 * defect this constant was introduced to remove (BRGY-96), just more slowly —
 * the user clicks, sends, and waits for a reply that never comes.
 */
export const SUPPORT_CONTACT: string | null = 'support@egov.local';

/** `mailto:` href for the contact, or null when no contact is configured. */
export const supportMailto = (): string | null =>
  SUPPORT_CONTACT ? `mailto:${SUPPORT_CONTACT}` : null;
