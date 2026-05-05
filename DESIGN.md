# INCI-Safe — Design Document

> *Living design doc. Update freely as decisions evolve. Last revised during a redesign session — see Git history for context.*

---

## 1. What this app is

A web app for scanning personal-care product barcodes (or searching by name) and surfacing what's actually inside them. Users see ingredient-by-ingredient information — color-coded by safety relevance, customizable to their own skin/hair concerns, and accompanied by recalls or lawsuits filed against the product.

The motivating question, in plain terms: **"I'm tired of standing in a store aisle deciding which product looks like the *least* something. I want a tool that just tells me what's in this bottle and what's worth knowing about it."**

## 2. What this app is NOT

Equally important. Existing apps in this space (Yuka, Think Dirty, EWG's Healthy Living, Clearya) all suffer from one or more of the following, and INCI-Safe is deliberately designed to avoid each:

- **Algorithmic verdict-rendering.** Most of these apps boil ingredients down to a single number ("7 out of 10") that masks where the rating came from. INCI-Safe uses categorical levels (green / yellow / red / contested) and shows the reasoning every time.
- **Fearmongering by default.** Apps that flag everything as "concerning" train users to either panic or stop trusting the app. INCI-Safe defaults to green and only escalates with explicit, sourced reasons.
- **One-size-fits-all judgment.** Coconut oil isn't "bad" — it's bad for acne-prone skin. Sulfates aren't "bad" — they're rough on dry hair. INCI-Safe makes this nuance first-class via session filters.
- **Account requirements, social features, and reviews.** None of these. See section 4.
- **Pretending consensus exists where it doesn't.** Some ingredients are genuinely contested, either on safety or on efficacy. INCI-Safe surfaces these as `contested` rather than picking a side.

## 3. Editorial voice

A specific tone, deliberately chosen:

> "Here's what regulators have established. Here's what dermatologists generally agree on. Here's where the experts disagree. **Your direct experience overrides any of this — if a product gave you a rash, that product gave you a rash, regardless of what we say. Consult a doctor for symptoms or sensitivities."**

This shows up in three places:

1. The persistent footer disclaimer ("informational only, not medical or legal advice").
2. A small italic line in every expanded ingredient detail reinforcing the same message — your experience trumps our database.
3. The phrasing of every flag reason — "may cause," "associated with," "frequently reported" rather than "causes" or "will."

Never preachy. Never alarmist. Never dismissive. The user is an adult; treat them like one.

## 4. Core design principles

### KISS — Keep It Simple, Stupid

The driving philosophy. Every feature has to earn its place against a default of "don't add this." When in doubt, ship without it.

### No accounts, ever

INCI-Safe will never require login. Privacy is a feature, not a setting. If a user wants their data persisted across devices, they're using the wrong app — that's a fundamentally different product with different costs and a different threat model.

### Session filters, not user profiles

The user's skin/hair/life-stage information is **session state, not stored identity**. Filter chips can be toggled per scan. Nothing is saved unless the user explicitly opts in. This:
- Matches how people actually shop (sometimes for themselves, sometimes for others)
- Respects privacy by default
- Removes onboarding friction (no "set up your profile" wizard)
- Stays trivially upgradeable to opt-in persistence later

### Curated database, user-submitted gaps

The ingredient knowledge base is curated by the developer. Users can request additions when they encounter unknowns, but submissions don't go live until reviewed and committed. This is the trust gate — without it, the app becomes Yuka.

### Contested as a first-class concept

Some ingredients are disputed. Not a bug, a feature worth surfacing honestly. See section 7.

### Consumer-friendly information design

Visually: dark theme, distinctive serif headings (currently Fraunces), refined sans body (currently Geist), dominant green accent, minimal use of red/yellow only where warranted. Editorial-magazine feel rather than SaaS-app feel — this is a *tool that respects you*, not a dashboard.

## 5. Ingredient knowledge schema

The core data structure. One record per known ingredient.

```js
{
  id: "coconut_alkanes",                  // stable internal ID
  inci_name: "Coconut Alkanes",            // official INCI label name
  aliases: [],                             // alternate names, common names
  kind: "active" | "inactive",             // FDA OTC drug active vs cosmetic inactive
  function: "Lightweight emollient...",    // one-line "what does it do"
  definition: "A hydrogenated coconut...", // 2-3 sentence plain-English explainer
  default_level: "green" | "yellow" | "red",  // baseline level with no filters set
  conditions: [                            // profile-driven escalations
    {
      matches_any: ["acne_prone"],         // any matching profile triggers
      level: "yellow",                     // resulting level if matched
      concern: "comedogenic",              // category tag (for grouping/filtering)
      reason: "Multiple dermatology..."    // user-facing explanation
    }
  ],
  contested: true | false,                 // experts disagree on safety OR efficacy
  contested_summary: "Dermatology and...", // user-facing summary of the dispute
  regulatory: [                            // see section 9
    { authority: "EU", status: "Permitted UV filter", reference: "Annex VI" }
  ],
  sources: [
    { side: "con", name: "Aesthetix Dermatology", url: "" },
    { side: "pro", name: "Paula's Choice", url: "" }
  ]
}
```

### Level evaluation logic

For each ingredient on a product, given the active filter set:
1. Start with `default_level`.
2. Walk every entry in `conditions`. If any tag in `matches_any` is in the active filter set, that condition triggers.
3. The strictest triggered condition wins (`red` > `yellow` > `green`).
4. The triggering condition is what gets shown as the "Flagged because:" reason in the expanded detail.

### Product risk scoring

For now, a simple tristate: any red ingredient → "High," any yellow → "Moderate," otherwise "Low." Doesn't account for ingredient counts or position on the label. Adequate for v1; refine if/when needed.

### Active vs. inactive distinction

A real and useful split. **Actives** are FDA-recognized OTC drug ingredients (sunscreen filters, anti-dandruff agents, anti-acne actives). **Inactives** are the cosmetic ingredients (cleansers, emollients, preservatives, fragrances). The split matters because it lets a user see what a brand is actually *selling them* (the active) versus what's filling out the formula. Display them in separate sections.

## 6. Profile / filter taxonomy

Current set, deliberately small. **Add new ones reluctantly.** Each new filter multiplies curation burden and cognitive load.

| Filter ID | Label | Concern type |
|---|---|---|
| `acne_prone` | Acne-prone | Comedogenic / pore-clogging |
| `oily_skin` | Oily skin | Comedogenic / heavy emollients |
| `dry_skin` | Dry skin | Drying / stripping |
| `sensitive_skin` | Sensitive skin | Allergens / irritants |
| `fragrance_allergy` | Fragrance allergy | Specific fragrance allergens |
| `curly_coily_hair` | Curly / coily hair | Drying / build-up |
| `color_treated` | Color-treated hair | Color-stripping / treatment-stripping |
| `pregnant_nursing` | Pregnant / nursing | Pregnancy-avoid lists |

### Hair typing note

Tightly curly / coily hair is captured under one filter (`curly_coily_hair`). The Andre Walker hair typing system (1A through 4C) goes deeper but is criticized as reductive across textured-hair traditions. A single chip is enough for v1; can be subdivided later if user demand emerges.

## 7. Contested ingredients

Two distinct kinds of dispute, both worth surfacing the same way:

### Safety contested
Examples: oxybenzone, methylparaben, formaldehyde-releasers. Some authorities consider these safe at use levels; others restrict or recommend avoiding. The user should know the dispute exists.

### Efficacy contested
Examples: charcoal in rinse-off products, "detoxifying" claims, "anti-pollution" claims. Cosmetic chemists generally consider these marketing theater; users may report real benefits. The dispute is "does this actually do anything," not "is it dangerous."

Both render the same way: a `disputed` mark on the pill, a `contested_summary` block in the expanded detail with both sides cited. The user decides.

## 8. Unknown ingredient flow

When the matcher hits an ingredient that isn't in the database:

1. Render the pill in **gray with dashed border**, showing the literal label text.
2. Below the ingredient list, show the count of unknowns and a **"Request additions"** button.
3. Clicking the button opens a pre-filled form (Tally form recommended for v1; mailto: as the simplest possible alternative). Pre-filled with: the ingredient names, the product name, the product UPC, optional notes field.
4. Submission goes to the developer's inbox. **Nothing appears live until reviewed.**
5. Developer triages, adds to the database, commits.

### Critical: do NOT show pending submissions to other users
Even labeled as "pending." The whole credibility of the app rests on the curation gate. Once you let unverified data render, you've reintroduced the problem the gate exists to solve.

### What the UI does NOT say
- Don't say "warning! unknown ingredient!"
- Don't render "?" or alarm icons
- Don't suggest unknowns are dangerous
- Just neutral acknowledgment — the database isn't omniscient yet

## 9. Regulatory / verified badges

A planned feature. Worth getting precise because most users (and most apps) misunderstand what "approved" means in cosmetics.

### What's real and citable

| Status | Authority | Applies to |
|---|---|---|
| **OTC monograph (GRASE)** | FDA | OTC drug actives only — sunscreens, anti-dandruff, anti-acne, antiperspirants. NOT cosmetic ingredients. |
| **Permitted UV filter** | EU Cosmetic Reg. 1223/2009 Annex VI | Specific sunscreen actives with concentration caps |
| **Permitted preservative** | EU Annex V | Methylparaben, sodium benzoate, phenoxyethanol, etc. |
| **Restricted ingredient** | EU Annex III | Concentration-capped or use-restricted ingredients |
| **Banned ingredient** | EU Annex II | Prohibited substances |
| **EU declared fragrance allergen** | EU labeling regulation | The 26 (now 80+) named fragrance allergens that must be listed individually |
| **CIR safety assessed** | Cosmetic Ingredient Review (industry-funded but independent) | Peer-reviewed safety assessments |

### What is NOT a real regulatory status (do not badge)

- "FDA approved" — FDA does NOT pre-approve cosmetics or most cosmetic ingredients. A badge claiming this would be technically false for almost everything.
- "EWG verified" — privately defined methodology with credibility issues; using it imports the problem.
- "Natural" / "Clean" / "Green" certifications — marketing terms, no regulatory backing.

### Schema

```js
regulatory: [
  { authority: "EU",  status: "Permitted UV filter", reference: "Annex VI" },
  { authority: "EU",  status: "Restricted to 6%",    reference: "Annex VI" },
  { authority: "FDA", status: "OTC sunscreen active (GRASE Cat. I)" }
]
```

### UI treatment

Small inline badges in the expanded ingredient detail. Visually quieter than the contested badge — these are stamps of regulatory record, not warnings.

## 10. What's deliberately NOT in scope

These have all been considered and rejected. Adding any of them changes what the app fundamentally is.

- **User accounts / login**
- **Cloud sync of preferences across devices**
- **User reviews or comments on products**
- **Star ratings or numeric scores**
- **"People who scanned this also scanned..." recommendations**
- **Social features of any kind**
- **Direct competitor (Yuka, EWG, etc.) verdict-importing**
- **Affiliate links to alternate products**
- **Ad placements**
- **Onboarding wizard / first-run flow**
- **Push notifications**

## 11. Data model: products

Unchanged from the existing app — already the right shape.

```js
{
  upc: "012345678905",
  name: "HydraShine Shampoo",
  brand: "Riverglow",
  category: "Hair Care",
  ingredients_raw: [
    "Aqua (Water)", "Sodium Laureth Sulfate", "..."
  ],
  notices: [
    {
      type: "recall",
      status: "past" | "current",
      date: "YYYY-MM-DD",
      title: "Description...",
      source: "https://..."
    }
  ],
  lawsuits: [
    {
      status: "filed" | "settled" | "dismissed" | "ongoing",
      date: "YYYY-MM-DD",
      title: "Description...",
      source: "https://..."
    }
  ]
}
```

### Future addition: image
Issue #1 on the project board. When tackled:
- Store image URL, not the image itself
- Use a small square thumbnail (~60×60) cropped from the center of the label
- Plan for missing images from day one — render a colored placeholder with brand initials rather than a broken-image icon
- Bottle photography is naturally portrait-oriented; crop or pad as needed

## 12. Ingredient matching

Current implementation: normalize the label text (lowercase, strip parentheticals, collapse whitespace, drop punctuation), then compare against `inci_name + aliases` for each ingredient record. Exact match only.

### Known limitations

- Typos and variant spellings won't match
- Localized names (French, Spanish on imported products) won't match
- Order-of-words variants ("Coconut Oil" vs "Oil, Coconut") won't match

### Possible future improvements

- Fuzzy matching with a small edit-distance tolerance (1-2 characters) — but **dangerous** because near-miss matches can be totally different ingredients (e.g., "Cetyl Alcohol" vs "Cetearyl Alcohol")
- Tokenized matching for compound names
- Multi-language alias support

For now: stay strict. Better to miss a match and let the user request the addition than to falsely match.

## 13. Migration plan: from current code to redesigned schema

Don't rebuild from scratch. The current codebase has solid bones — only the rule engine needs to be replaced. Branch (`v2-schema`) and surgical-strike the rule engine without touching the rest.

### Delete from existing code

- `DEFAULT_RULES` array
- `getRules()`, `persistRules()` — no more user-editable regex rules
- The `#newRule` / `#addRule` / `#rules` DOM in `index.html`
- `products.json` at the repo root (old `{name: {dangerous: true}}` schema, dead)
- `products.csv` (empty, not pulling weight)
- One-line `README.md` inside `conscious-scanner/` (redundant with root README)

### Rewrite

- `analyzeIngredients()` — replace regex-matching with the new ingredient knowledge base lookup + level evaluation logic from section 5
- `renderProduct()` — render pills using the new resolved-ingredient shape (level, triggered condition, contested flag)
- The sidebar that held rule-editing UI → repurpose into the **filter chips** section

### Add

- `data/ingredients.json` — the knowledge base. Start small (20–40 ingredients covering the most common cases) and grow via user submissions.
- A small filter-state module — read/write the active filter set. Default to Set in memory; opt-in localStorage persistence later.
- The unknown-ingredient request button + form integration.

### Keep untouched

- Product persistence (`loadProducts`, `persistProducts`, `mergeProducts`, `findProduct`)
- Import/export (`onFilePicked`, `parseCSVProducts`, `parseJSONProducts`, `exportProducts`)
- QuaggaJS scanner (or upgrade — see section 14)
- History (`saveHistory`, `renderHistory`, `timeago`)
- Most of the existing CSS

## 14. Barcode scanning

Currently uses **QuaggaJS**, which is unmaintained (last meaningful release ~2021) and has spotty real-world accuracy.

### Upgrade path

The native [BarcodeDetector API](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector) works in Chrome/Edge/Android-Chrome and increasingly Safari, with much better accuracy and performance. Use it where available, fall back to QuaggaJS:

```js
if ('BarcodeDetector' in window) {
  // Use native API
} else {
  // Fall back to QuaggaJS
}
```

Not urgent. Do this when convenient — the existing scanner works for proof-of-concept.

## 15. Roadmap

### v1 (current redesign)

- New ingredient knowledge schema in place
- Session filter chips replacing the rules editor
- Click-to-expand pills with definitions, contested summaries, sources, micro-disclaimer
- Unknown-ingredient request flow (Tally form for submissions)
- Active vs. inactive ingredient grouping
- Collapsible recalls/lawsuits sections
- Search-by-name product lookup (alongside barcode scan)

### v1.5 (immediate next steps)

- Regulatory badges on ingredients (FDA OTC monograph, EU annex citations, EU declared fragrance allergens)
- Product image support (Issue #1)
- BarcodeDetector API upgrade with QuaggaJS fallback

### v2 (later)

- Hair care guidance page (your stylist's recommendations) — sourced expertise rather than algorithmic verdict
- Real submission backend (Cloudflare Worker / Netlify function + free-tier DB) when Tally form outgrows itself
- Grow the ingredient database meaningfully (target: top 200 most-common cosmetic ingredients covered)
- Optional opt-in localStorage persistence for filter selection ("remember my selection")

### Maybe-someday / not-soon

- Multi-language ingredient name support
- Browser extension for shopping site auto-scan
- Mobile-app wrapper (PWA first; native only if PWA proves insufficient)
- Integration with OpenBeautyFacts as a fallback data source

## 16. Open design questions

These haven't been resolved. Worth deciding before they bake into code:

### Should `Fragrance` default to yellow for everyone?

Currently yes. Some chemists would argue that's fearmongering and it should default to green, only escalating to yellow when `fragrance_allergy` or `sensitive_skin` is set. The argument for the current default: most people *will* have some level of fragrance sensitivity, and the catch-all nature of "fragrance" (undisclosed components) is the dispute itself. The argument against: imposes a yellow on every fragranced product universally, which conflicts with the "default to green, escalate with reason" principle.

**Status: unresolved. Lean toward keeping yellow default but worth revisiting.**

### Per-allergen pills vs. grouped fragrance display

When a product has 5 declared fragrance allergens (Limonene, Linalool, Citral, Benzyl Salicylate, Benzyl Alcohol), the current design shows 5 separate yellow pills. The KISS-aligned alternative is a single summary line ("contains 5 EU-declared fragrance allergens"). Per-pill is more actionable for users trying to identify which specific ingredient broke them out; grouped is cleaner.

**Status: unresolved. Try both with real users (or self-testing) and see which feels right.**

### Should "contested" badge differentiate safety vs. efficacy disputes?

Currently both render the same way. Could be split into separate badges. Probably not worth it unless real user confusion emerges.

**Status: unresolved. Default to keeping unified.**

### Pregnancy as a profile vs. its own per-ingredient flag

Currently a profile (`pregnant_nursing`). Could also be modeled as a boolean flag on the ingredient itself (`pregnancy_avoid: true`). Profile is simpler and more uniform; the flag would be more semantic. Probably stay with profile.

**Status: stay with profile unless something forces a change.**

## 17. Editorial stance on specific ingredient categories

Decisions made (so the database stays internally consistent as it grows):

- **Sulfates (SLES, SLS)** — green by default. Yellow for dry, sensitive, color-treated, curly/coily. Not red anywhere; they're effective cleansers, not toxic.
- **Parabens** — yellow by default and contested. The endocrine-disruption concern is real in lab studies but contested at real-world exposures. Many people avoid as precaution; others (FDA) consider safe.
- **Formaldehyde-releasers (Quaternium-15, DMDM Hydantoin, etc.)** — red. Recognized contact allergens, well-documented sensitization risk.
- **Mineral UV filters (zinc oxide, titanium dioxide)** — green. Broadly safe. Pregnancy-safe.
- **Chemical UV filters (oxybenzone, octinoxate, etc.)** — yellow by default, often contested. Endocrine-disruption concerns + reef-environmental concerns. Red under pregnancy filter.
- **Retinoids (retinol, retinyl palmitate, tretinoin)** — green default. Red under pregnancy filter.
- **Salicylic acid in rinse-off** — green default. Yellow under pregnancy (low-concentration topical generally fine but worth a doctor's input).
- **Coconut-derived ingredients (raw coconut oil, coconut alkanes)** — green default. Yellow for acne-prone. Coconut alkanes also marked contested due to dermatology/chemistry disagreement.
- **EU declared fragrance allergens** — green default. Yellow for fragrance allergy / sensitive skin. Worth showing as a category-tagged group ("fragrance allergen") in the UI.
- **Charcoal (rinse-off)** — green default. Yellow for dry / curly coily. Contested on efficacy grounds.

These aren't permanent — revisit when new evidence or a clear shift in expert consensus emerges. Note the change in this doc.

## 18. References / inspirations

Apps studied (and what we're avoiding from each):
- **Yuka** — too aggressive, no nuance, social-feature creep
- **Think Dirty** — opaque scoring methodology
- **EWG Healthy Living** — fearmongering reputation, contested ratings
- **Clearya** — closer to the right idea but sales-funnel-driven

Sources we generally trust:
- EU Cosmetic Regulation 1223/2009 (the annexes)
- FDA OTC monographs for sunscreens, anti-dandruff, anti-acne
- CIR (Cosmetic Ingredient Review) safety assessments
- Peer-reviewed dermatology literature
- Specific dermatologists' practice writing (case-by-case credibility check)

Sources we use cautiously:
- Cosmetic chemistry blogs (LabMuffin, The Beauty Brains) — credible on the chemistry side, sometimes underweight clinical/sensitization data
- Brand-affiliated dermatology content — read with awareness of the affiliation

---

*End of design document. When in doubt, follow KISS.*
