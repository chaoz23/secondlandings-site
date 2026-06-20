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

## Deploy

Host: **Porkbun Static Hosting** with **GitHub Connect** — push to the linked
repo and it auto-deploys, with free SSL. So the deploy workflow is just:

```bash
git add -A && git commit -m "…" && git push
```

The domain `secondlandings.com` points at the Porkbun static host.
