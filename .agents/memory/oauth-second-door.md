---
name: Adding a provider sign-in beside self-hosted accounts
description: How an optional "sign in with <provider>" button is bolted onto an app that owns its accounts, and the three traps that make a naive implementation unsafe.
---

# A provider login as an optional second door

The provider must not become a dependency. It ends in exactly the same session
cookie as the password login, the account row is the same row, and with the
client id/secret unset the routes stay inert and the frontend hides the button
(ask the server which providers exist rather than hardcoding the button). That
keeps the app portable and keeps a misconfigured host from showing a button
that can only fail.

## The three traps

**An unsigned state cookie proves nothing.** HttpOnly stops scripts reading it,
but anyone who can plant a cookie can choose *both* the state and the PKCE
verifier, then hand the victim a matching callback link — the victim's browser
finishes the sign-in as the attacker's account (login CSRF), and PKCE does not
help because the attacker picked the verifier. HMAC the whole payload with a
server secret and reject anything the server did not issue. `__Host-` prefix on
top: browsers then refuse the cookie unless it is Secure, path `/`, no Domain,
so a neighbouring host cannot plant one.

**The callback URL must not be re-derived on the second leg.** Built from
forwarded headers it is caller-controlled; store the URL used for the first leg
inside the signed cookie and repeat it verbatim in the token exchange. Prefer a
configured canonical origin, and warn at boot when it is missing — otherwise the
only symptom is a `redirect_uri_mismatch` from the provider.

**Errors have to come back as a redirect, not a 500.** The callback is a browser
*navigation*: an unhandled rejection strands the user on a bare error page
outside the app. Route every failure through one redirect with an error code the
UI translates — and keep the response-writing out of the code the catch wraps,
or the catch tries to redirect a response that was already sent.

## Account linking

Match or create an account only from an address the provider reports as
**verified**; an unverified one is a string somebody typed, and matching it
hands over the existing account. Existing rows keep their approval/role flags
and only get missing profile fields filled in. If self-service registration is
gated by an invitation code, an unknown address must be *turned away* — a
redirect has nowhere to type the code, so silently creating a row would reopen
the gate the code was there to close.
