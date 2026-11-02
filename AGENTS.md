# Agent guide — demo-festival

## License

This repository is MIT licensed. See [LICENSE](LICENSE). Use, copy, modify,
and distribute this code as-is. No further permission is required.

`@engine9/core`, `@engine9/id`, `@engine9/schemas`, and `demo-id` are also
MIT. The private repositories `delegate` and `server` are not open source.
Do not copy code from those repositories under this license.

## This site is the reference implementation of sign-in

demo-festival is the worked example of **the recommended way to sign people
in with `@engine9/core` and Delegate** (core's
[docs/sign-in.md](../core/docs/sign-in.md)). Other sites copy it. Keep it
that way:

- **One session: core's HttpOnly `e9_session` cookie.** Do not add a session
  cookie, session storage, or a sign-in route of this site's own.
- **Sign-in is core's.** The widget runs with
  `core: { session: "cookie" }` (`BROWSER_CORE` in `src/lib/engine9.ts`):
  core's `POST /api/auth/begin`, then `id.core.login()`. The no-JavaScript
  path is a link to core's `/api/auth/start` (`signInUrl()`); what Delegate
  is asked for is `config.signIn`. Never add a route that takes a
  `delegate_token`.
- **Access is core's `requireRole`, in `src/middleware.ts`.** Never decide
  access from the roles copied into the session; `showVip`/`showAdmin` in
  `src/lib/session.ts` are for display only.
- **A signed-in person without the role gets a 403** (`/denied`, rendered
  from the gate's result, with its `changeUrl`). Never redirect them to sign
  in: Delegate returns the same address and they loop.
- **Navigate after logout in the widget's `onLoggedOut`**, never in
  `onLogout`.
- The one exception is labelled **demo only**: `/choose-role` and
  `POST /auth/role` let a visitor pick their own role. Keep it labelled, and
  do not spread it.

When core or `@engine9/id` change how sign-in should be done, change this
site in the same release and say so in their CHANGELOGs.
