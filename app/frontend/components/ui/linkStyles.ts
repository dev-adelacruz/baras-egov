/**
 * Shared style for inline text links.
 *
 * Links used to be `text-brand-700`, which put them at `#ca3500` — 11° of hue
 * and 1.23:1 of luminance away from the `danger-700` `#c10007` used for error
 * text. On the login form, where errors are the thing users scan for, an
 * orange "Forgot password?" reads as something having gone wrong.
 *
 * Two changes fix it. The colour moves to neutral slate (10.34:1 on white, and
 * a desaturated blue-grey is not confusable with a saturated red), and the
 * underline means colour is no longer the only signal that something is a link
 * — brand colour returns on hover, where there is no ambiguity to create.
 */
export const TEXT_LINK =
  'font-semibold text-slate-700 underline underline-offset-2 decoration-slate-300 ' +
  'hover:text-brand-700 hover:decoration-brand-500 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 rounded-sm ' +
  'transition-colors duration-150';
