# packages/react

Published as the `spurvik/react` export of the `spurvik` package. This directory is build-from-source inside the repository.

Disclosure labels for EU transparency notices, including `AIArticle50Section3Notice` for Article 50(3).

Peer-depends on React 19. No dependency on `apps/web`. Private until the repository owner records a licence. See the root `LICENSE`.

The labels support transparency work. They are not a conformity finding.

`AIDisclosureLabel` does not write browser storage or call the disclosure endpoint unless `beacon.consent` is true. The site operator obtains that consent. Leaving the prop off is the default.

By default, `AIDisclosureLabel` also renders a small "Art. 50 · Spurvik" link to https://spurvik.com after the disclosure text (`attribution`, default `true`). The disclosure text stays first in the DOM and reading order. The link opens in a new tab, has no query parameters, and does not set cookies or make a network call. Pass `attribution={false}` to omit the link and keep the previous markup. Removing the link is a Pro (€19/mo) and Team (€79/mo) option under the plan terms. The component does not check the plan; the console handles that. This default is a visible change for existing Free-plan users who render the label without passing `attribution={false}`.
