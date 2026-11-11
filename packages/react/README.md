# packages/react

Published as the `spurvik/react` export of the `spurvik` package. This directory is build-from-source inside the repository.

Disclosure labels for EU transparency notices, including `AIArticle50Section3Notice` for Article 50(3).

Peer-depends on React 19. No dependency on `apps/web`. Private until the repository owner records a licence. See the root `LICENSE`.

The labels support transparency work. They are not a conformity finding.

`AIDisclosureLabel` does not write browser storage or call the disclosure endpoint unless `beacon.consent` is true. The site operator obtains that consent. Leaving the prop off is the default.

`attribution` is off by default, so `AIDisclosureLabel` does not render an "Art. 50 · Spurvik" link unless you pass `attribution={true}`. That link points to https://spurvik.com, opens in a new tab, has no query parameters, and does not set cookies or make a network call. The disclosure text stays first in the DOM and reading order.
