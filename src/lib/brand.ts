/**
 * How Delegate's sign-in page looks for this site: the same colors as the
 * `:root` in Layout.astro. Sent with every login request; Delegate stores
 * none of it and always shows this Domain under the name.
 *
 * `google` is per flow: a popup (the widget, `requestIdentity`) must keep
 * Delegate's Google button, so it is restyled (`brand`); a full-page login
 * (`/auth/login`) goes straight to Google (`skip`).
 */
export const SIGN_IN_BRAND = {
  name: "Solstice Wave",
  color: "#a855f7",
  background: "#0d0a1f",
  text: "#f1eeff",
} as const;

export const POPUP_SIGN_IN_BRAND = { ...SIGN_IN_BRAND, google: "brand" } as const;
export const REDIRECT_SIGN_IN_BRAND = { ...SIGN_IN_BRAND, google: "skip" } as const;
