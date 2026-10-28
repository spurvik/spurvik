# @spurvik/react

Disclosure labels for EU transparency notices, including `AIArticle50Section3Notice` for Article 50(3).

Peer-depends on React 19. No dependency on `apps/web`. Private until the repository owner records a licence. See the root `LICENSE`.

The labels support transparency work. They are not a conformity finding.

`AIDisclosureLabel` does not write browser storage or call the disclosure endpoint unless `beacon.consent` is true. The site operator obtains that consent. Leaving the prop off is the default.
