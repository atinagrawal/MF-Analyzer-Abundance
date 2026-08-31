# Image Prompts for "Why Looking at a Fund's NAV Is a Terrible Way to Judge It"

Two prompts: the hero/card image, plus one supporting image placed mid-article
(already wired into the markdown at `content/articles/pillar1-nav-tells-you-nothing.md`,
right after the ₹500-vs-₹10 worked example — it just needs the file to exist).

**Target output:** 1200×630 px (or closest available ratio, e.g. 16:9 — crop to fit).
Same style and constraints as the rest of the series.

---

## The fixed style block (identical in every prompt)

> Style: photorealistic isometric 3D render, museum-vault / private-bank
> aesthetic — dark forest green (#1b5e20) surfaces with brass and gold
> architectural accents, marble and dark wood textures, soft dramatic
> directional lighting, shallow depth of field, a slightly elevated
> three-quarter camera angle. Composition should feel premium, quiet, and
> institutional — not playful, not cartoonish, not a flat illustration.
>
> Hard constraints: **no readable text, numbers, logos, tickers, or real
> brand/company names anywhere in the image** — no signage, no labels, no
> screens with visible text, no coins with legible denominations spelled
> out. If a "screen" or "card" appears, show only abstract glowing
> shapes/icons, never simulated text (AI image generation reliably garbles
> real text, and a finance brand cannot publish visibly misspelled tickers).
> Avoid clichés: no generic up-and-to-the-right line charts, no floating
> dollar signs, no handshake close-ups, no piggy banks, no bull/bear
> statues.

---

## 1. Hero / card image — save as `public/articles/nav-tells-you-nothing.jpg`

[fixed style block above] +

Two transparent glass display canisters standing side by side on a marble
pedestal, lit from above. The left canister holds a handful of large gold
coins, stacked loosely, filling it to a certain height. The right
canister holds hundreds of tiny gold coins, filling it to the exact same
height. Different coin count, identical fill level — the visual point is
that both canisters hold the same amount, just divided differently. No
text, no numbers, no scale markings on the glass.

---

## 2. Mid-article image — save as `public/articles/nav-tells-you-nothing-inline.jpg`

[fixed style block above] +

A jeweller's brass balance scale on a marble counter, perfectly level. One
pan holds a small handful of large gold coins. The other pan holds a much
larger pile of small gold coins. The beam sits dead level between them —
the visual point is that the two very different-looking piles weigh
exactly the same. Close, slightly low camera angle so the level beam
reads clearly at a glance. No text or numbers anywhere.

---

## After generating

Same as before — send both over for a look (style consistency, no
rendered text, crop, file size under ~250KB) before anything gets wired
into `lib/articles.js` or committed.
