/**
 * How Delegate's sign-in page looks for this site: the same colors as the
 * `:root` in Layout.astro. Sent with every login request; Delegate stores
 * none of it and always shows this Domain under the name.
 *
 * `google: "brand"` restyles Delegate's Google button in these colors. With
 * more than one provider Delegate always shows its provider screen (the
 * visitor picks), so there is nothing for `google: "skip"` to skip.
 */
export const SIGN_IN_BRAND = {
  name: "Solstice Wave",
  color: "#a855f7",
  background: "#0d0a1f",
  text: "#f1eeff",
  google: "brand",
} as const;

/**
 * Sign-in buttons Delegate shows for this site, in order, on every login:
 * the widget, the popups on /login, and core's redirect sign-in. Delegate
 * drops any its operator has not enabled (`ENABLED_PROVIDERS`). Facebook is
 * Level 3, but its email is never marked verified.
 */
export const LOGIN_PROVIDERS: ("google" | "facebook")[] = ["google", "facebook"];
