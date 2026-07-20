# Second Landings — website

The landing page for **Second Landings** (secondlandings.com): a single-scroll,
static brand page. No build step, no framework, no backend.

Brand MTP: *helping people at a crossroads in their life re-find meaning.* The
page leads with that purpose and invites readers to the Substack.

## Files

| File | What it is | Edit it to… |
|------|------------|-------------|
| `index.html` | The landing page (hero, premise, who-it's-for, who's-writing, invitation, footer) | Change copy, links, the CTA target |
| `styles.css` | Design system — two themes (ivory + espresso, auto by `prefers-color-scheme`) | Tweak colors (via the CSS variables at top), spacing, type |
| `items.json` | **Dormant** — data for a future `/collection` page; not rendered by the landing page | Ignore unless building the collection page |
| `app.js` | **Dormant** — renders `items.json` cards; not loaded by the landing page | Ignore unless building the collection page |
| `inkcheck/` | Public Inkcheck form and human-readable report at `/inkcheck/` | Change checker copy, styling, or its public API URL |

Design language is deliberately high-end and restrained: Cormorant Garamond +
Jost, antique-brass accent used sparingly, hairline rules, generous whitespace,
no emoji. Change colors only via the CSS custom properties so both themes stay in
sync.

## Preview locally

Don't just open `index.html` from disk — serve it:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The static landing page previews fully this way. The `/inkcheck/` page can be
reviewed for layout, copy, file selection, and report rendering, but submitting a
real hosted check depends on the production Inkcheck API declared in
`inkcheck/index.html`. That API must allow the browser origin making the request;
the production origin is `https://secondlandings.com`, so a plain localhost
preview is not a complete end-to-end form test unless the API is temporarily
configured to allow it or a local mock endpoint is used.

## Deploy

Host: **Porkbun Static Hosting** with **GitHub Connect** — push to the linked
repo and it auto-deploys, with free SSL. So the deploy workflow is just:

```bash
git add -A && git commit -m "…" && git push
```

The domain `secondlandings.com` points at the Porkbun static host.

The Inkcheck page calls the separately hosted checker at the URL in its
`inkcheck-api` meta tag. The service must explicitly allow
`https://secondlandings.com` as its browser origin before the form will work.
