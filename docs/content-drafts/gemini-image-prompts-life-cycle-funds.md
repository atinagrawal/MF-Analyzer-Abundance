# Image Prompts for "SEBI's Newest Mutual Fund Category Rebalances Itself"

**A deliberate style departure.** The rest of the article series uses one
fixed museum-vault / brass aesthetic for brand consistency across the
whole index page. Per direction, this article gets its own visual
language instead, built specifically around what a Life Cycle Fund
actually *does* — glide from one state to another and land on a fixed
date — rather than reusing the vault motif for a topic it doesn't really
fit. The **hard technical constraints stay the same** (no readable text,
no clichés) since those are practical necessities, not house style.

**Target output:** 1200×630 px (or closest available ratio, e.g. 16:9 —
crop to fit). JPG or PNG, no upscaling artifacts. Keep each file under
~250KB after compression, matching the rest of the series.

---

## The fixed style block for THIS article (identical in every prompt below)

> Style: photorealistic aerial/elevated 3D render, cinematic golden-hour-
> to-blue-hour lighting. The entire piece is built around a single warm-
> to-cool color transition — sun-lit gold, amber, and warm bronze tones
> on one side, shifting gradually into cool silver, slate blue, and misty
> grey on the other — representing a deliberate journey from energetic/
> growth-oriented to calm/settled, never an abrupt cut between the two.
> Wide, quiet, contemplative compositions — vast landscapes or long
> sightlines rather than close-up objects. Premium and cinematic, like a
> high-end documentary establishing shot, not a corporate stock photo.
>
> Hard constraints: **no readable text, numbers, logos, tickers, or real
> brand/company names anywhere in the image** — no signage, no labels, no
> screens with visible text, no coins with legible denominations spelled
> out. Avoid clichés: no generic up-and-to-the-right line charts, no
> floating dollar signs, no handshake close-ups, no piggy banks, no
> bull/bear statues, no literal calendar pages or clock faces.

---

## 1. Hero / card image — save as `public/articles/life-cycle-funds-explained.jpg`

[fixed style block above] +

An aerial view of a single winding mountain road, seen from a high,
slightly oblique angle, beginning at a sunlit, warm golden peak in the
upper portion of the frame and descending in a long, smooth, deliberate
curve down into a calm, cool, mist-filled valley below. The road's own
surface material visibly transitions along its length — coarse warm
gold gravel and rock near the peak, gradually becoming smooth pale grey
stone by the valley floor. In the valley, at a single fixed point where
the road ends, one small, warm point of light glows steadily — the only
light source in the cool lower half of the frame, clearly marking a
destination rather than a random stopping point. No vehicles, no people,
no structures, no text or markers on the road itself beyond that one
glowing end-point.

---

## 2. Inline image (recommended) — "the glide path" mechanism — save as `public/articles/life-cycle-funds-explained-inline-glide.jpg`

[fixed style block above] +

A single bird — rendered simply and elegantly, more silhouette than
detailed anatomy — caught mid-flight in a long, smooth, deliberate
downward gliding arc, wings held steady rather than flapping. It begins
in bright warm golden light in the upper portion of the frame and
descends through the frame into cool silver-blue mist below, where a
single small glowing point marks a precise landing spot directly beneath
its flight path. The arc of the glide itself should read as calm and
controlled, not urgent or falling — a deliberate, gradual descent aimed
at one exact point, not a general downward drift.

---

## 3. Inline image (optional) — the tapering early-exit charge — save as `public/articles/life-cycle-funds-explained-inline-gates.jpg`

[fixed style block above] +

Three simple architectural gateways — freestanding stone or brass arches,
not doors — placed one after another along the same road from the hero
image, receding into the distance. The nearest gateway (closest to the
warm golden end of the road) is the tallest, most solid, and most
imposing of the three, with a faint warm amber glow across its archway
as if guarded. Each successive gateway further down the road, closer to
the cool misty valley, is visibly smaller, lighter, and less imposing
than the one before it, its glow dimmer, until the road beyond the third
gateway opens out freely into the misty valley with no further gate at
all. The shrinking sequence of three gates followed by open road is the
entire point of the image — no numbers or markings on any gate.

---

## After generating

Save under `public/articles/` using the exact filenames above (matching
the `image` field already wired into `lib/articles.js` for the hero;
the two inline images are optional extras for within the article body —
only add them to the markdown if you generate them). Send them over for
a look — especially the warm-to-cool transition and that no text slipped
through — before anything gets committed.
