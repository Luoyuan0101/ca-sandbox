# Project Plan — CA Sandbox

**Project:** Cellular Automata Sandbox — wildfire spread simulation
**Repository:** https://github.com/Luoyuan0101/ca-sandbox
**Author:** Luoyuan0101
**Last updated:** 2026-10-11

---

## 1. Find a direction

The starting point was a physics question I could not answer with a formula: *how does a wildfire actually spread?*

Textbook problems give you a fire front and ask you to calculate something. But a real fire has no front drawn on it. It starts at one point and then the shape of the burned area comes out of nowhere. Nobody draws the outline.

I picked cellular automata because it is the smallest idea that produces that behaviour. One grid, one rule per cell, no central plan — and yet the fire "decides" where to go. That gap between the simplicity of the rule and the complexity of the result is the thing I wanted to see with my own eyes.

Talking with AI helped mainly by **narrowing**. My first idea was "simulate a forest fire," which is not a project — it is a topic. AI pushed me to ask what specifically I wanted to be able to *say* at the end. That turned into a testable question: **does attacking a fire early actually matter, and by how much?**

That question is what made the project buildable, because it implies I need a control group (no firefighters) and a variable (response delay). Everything else in the project exists to serve that comparison.

## 2. Research

| Source | What I took from it |
|---|---|
| Conway's Game of Life | The core mechanic: everything is a local rule, and global structure is emergent. Confirmed that a grid alone is enough to be interesting. |
| Wolfram's *A New Kind of Science*, ch. 1–2 | Rule tables and how small rule changes produce qualitatively different behaviour. Helped me decide to use a multi-stage state machine rather than a binary "burning / not burning" flag. |
| SIR model (epidemiology) | The idea of states with different transition probabilities. Directly shaped my five-state chain. |
| Standard wildfire spread literature (surface fire rate-of-spread, Rothermel-style qualitative descriptions) | Real fires do not jump cell to cell instantly. Fuel type and moisture dominate. Wind biases direction. This is why I gave each cell a fuel type with its own flammability, and why wind is a directional multiplier rather than a global speed-up. |
| Firebase / real incident reports on wildfire containment | The single most important thing I read: **containment is achieved with firebreaks, not by extinguishing the fire front.** That one fact changed my model. |
| Next.js + Canvas 2D docs | Technical: how to render 14,400 cells smoothly without React re-rendering every cell. |
| `pptxgenjs` / `docx` docs | How to generate real, editable files (not screenshots) in the browser for the experiment report. |

**Reusable pieces I kept:** the seeded PRNG (mulberry32) pattern for reproducible experiments, the five-state chain design, and the idea of separating "the model" from "the view" so the model can be run headless in Node for testing.

**What I deliberately did not reuse:** any pre-built fire simulator. I wanted the rules to be mine so that when the result surprised me I would know exactly which line caused it.

## 3. Narrow down

The scope was cut in three passes.

**Cut 1 — one hazard, not two.** The original idea was "wildfire *and* epidemic." I built the fire sandbox first and the epidemic one is still a placeholder page. Two half-built sandboxes are worth less than one sandbox I can defend line by line.

**Cut 2 — procedural terrain, not a real map.** I do not have real terrain data, and importing it would have consumed the whole project. A procedurally generated grid with coherent terrain is enough to show the phenomenon. **Scale: 1 cell = 10 m**, so the default 160×90 map is 1.60 km × 0.90 km ≈ 1.44 km². That is a plausible "local fire" — a small forest block or a grass field. Real megafires are several thousand times that, so the project is explicitly about *regimes and trends*, not about predicting a specific real fire. (A real-world mode using built-in lat/lon outlines of Eurasia was added later, but the procedural map remains the default because it is the one whose every property I can explain.)

**Cut 3 — the question, made concrete.** The specific claim I wanted to test:

> Two identical fires. Same terrain, same weather, same seed. The only difference is **when the fire crew arrives**.
> Does arrival time change the outcome, and does "early" beat "many"?

Concrete scenario: a lightning strike at the centre of a mixed grass/conifer map, 2–8 crews arriving after a configurable delay of 0–40 turns. Measure burned fraction.

**On grid size.** The first working version used a fixed 80×50 grid (4,000 cells). It was later raised to an adjustable size with a default of 160×90 (14,400 cells), because 4,000 cells were too coarse to see terrain structure — ridgelines, valleys and river courses were only a few cells wide and mostly noise. The table of results below was measured at 80×50 and is kept as-is, since it is what the model actually produced at the time; the qualitative conclusion has held at every size tested since.

This is a question a student can answer in one afternoon of clicking, which is exactly the point.

## 4. Propose a solution

**Why cellular automata can answer it.** The delay variable only has meaning if the fire is *time-dependent*. In a formula-based model, "when you arrive" is just a number you plug in. In a CA, the fire has a history — it occupies a certain area at a certain turn, and that area is what the crews have to contend with. The CA makes the *timing* physical rather than symbolic.

**What it adds over the obvious existing approaches:**

| Existing approach | Limitation | What this adds |
|---|---|---|
| Textbook rate-of-spread formulas | Gives you a speed, not a shape. Cannot show a firebreak working. | Emergent shape; you can literally draw a barrier and watch the fire fail to cross. |
| Watching a wildfire animation/video | Passive. You cannot run a counterfactual. | You can run the *same* fire twice with one variable changed. That is the whole point. |
| Pre-built simulator software | Rules are hidden; it is a black box. | Every rule is visible in `lib/fireModel.ts`. If the result is wrong I can point at the line. |

**Design decisions and their reasoning:**

- **Five states, not two.** `Normal → Ember → Heating → Burning → Ash`. A binary burn flag makes fire spread at the speed of the loop. The staged chain makes spread *rate* emerge from fuel properties, and lets rain and humidity slow the chain instead of just flipping a boolean.
- **Fuel types with real burn durations.** Dry grass catches almost instantly and burns out fast; conifer forest is slow to catch and burns for a long time. This is what makes terrain composition matter.
- **Wind as a directional bias, not a global multiplier.** Downwind neighbours get a higher probability; upwind neighbours get a lower one. Without this the fire is a symmetric circle, which looks wrong immediately.
- **Moisture and rain act on the transition probability**, so a wet cell can still eventually burn — it is slower, not immune.
- **Fire crews modelled as agents with self-preservation.** They spawn at the map edges, only attack cells that still have unburnt neighbours (attacking ash is pointless), cannot walk across ash, retreat if the fire reaches them, and stop one cell short of the fire front.

> **Assumption (untested):** the crew behaviour is a reasonable caricature of real firefighting tactics. I have not validated it against professional doctrine.

- **A wet firebreak state.** This is the one addition that came directly from the research: since containment is about firebreaks, the model needs a way to *make* one. The wet line blocks fire completely — but it dries out after a number of turns and then the fire crosses. This creates a genuine race against time instead of a permanent wall.

> **Assumption (untested):** the drying-out time constant (24–54 turns) is tuned for interesting gameplay, not calibrated to physical data.

- **Seeded reproducibility.** Same seed + same parameters = identical run. Without this, no comparison between two runs would mean anything.

## 5. Define a minimal workflow

**The simplest complete workflow** is: *generate a map → ignite it → watch it burn → read the final burned fraction.* If those four steps work, the project already produces a meaningful result, because you can run it with crews off and with crews on and compare two numbers.

**Kept in v1:**

- One sandbox (wildfire), adjustable grid (default 160×90, range 80×50 – 320×200)
- Five-state combustion with fuel types, moisture, humidity, wind, rain
- Crew on/off toggle + configurable count, speed, arrival delay, and tactic
- Run/pause, adjustable playback speed (0.25×–2×) plus a 200-turn fast-forward
- Elevation view, real-world map (Eurasia outline), zoom with the mouse wheel
- Live chart of the five state counts per turn
- CSV / JSON / Word / PPT export so results can leave the sandbox

**Deferred:**

- The epidemic (SIR) sandbox — placeholder page only
- Real geographic data import
- Comparison of two runs side by side in the UI
- Any form of machine learning on top of the simulation

**Why this order:** the export comes *before* extra features on purpose. An experiment you cannot write down is not an experiment. Being able to produce a PPT with the curve in it is what forces the project to have an actual finding rather than just being fun to watch.

**Result of the minimal workflow (the finding it produced):**

Burn fraction, averaged over 4 seeds, mixed terrain, 80×50:

| Crews | Delay 0 | Delay 5 | Delay 18 | Delay 40 |
|---|---|---|---|---|
| 0 (unattended) | 66% | 66% | 66% | 66% |
| 2 | 36% | 61% | 50% | 56% |
| 4 | **9%** | **2%** | 61% | 58% |
| 8 | **8%** | **1%** | 26% | 59% |

The minimal workflow was sufficient to state a real conclusion: **arriving 18 turns late is roughly equivalent to not sending crews at all (61% vs 66%), and arriving early beats arriving in greater numbers.** Four crews that arrive early (2%) outperform eight crews that arrive late (59%).

## 6. Build it

**Status: built and working.**

| What | Where |
|---|---|
| Model core — states, spread probability, crews, terrain generation | [`lib/fireModel.ts`](../blob/main/lib/fireModel.ts) (~1600 lines) |
| Real-world map data — lat/lon polygon outlines + point-in-polygon test | [`lib/atlas.ts`](../blob/main/lib/atlas.ts) |
| Export — PPT / Word / CSV / JSON | [`lib/export.ts`](../blob/main/lib/export.ts) |
| Fire sandbox page | [`app/fire/page.tsx`](../blob/main/app/fire/page.tsx) |
| Canvas renderer (14,400 cells at default size) | [`components/FireCanvas.tsx`](../blob/main/components/FireCanvas.tsx) |
| Parameter panel | [`components/ControlPanel.tsx`](../blob/main/components/ControlPanel.tsx) |
| Map operation panel (world / random / paint / import) | [`components/MapPanel.tsx`](../blob/main/components/MapPanel.tsx) |
| Live chart | [`components/StatsChart.tsx`](../blob/main/components/StatsChart.tsx) |
| Zero-install demo (no build step) | [`preview/index.html`](../blob/main/preview/index.html) |
| Self-contained bundle builder | [`scripts/build-docs.mjs`](../blob/main/scripts/build-docs.mjs) |
| Epidemic sandbox | [`app/disease/page.tsx`](../blob/main/app/disease/page.tsx) — **placeholder, not built** |

> Note: `components/TerrainEditor.tsx` is superseded by `MapPanel.tsx` and is no longer
> imported anywhere. It is kept in the tree only because it still type-checks; it can be
> deleted at any time (`git rm`) — the previous version remains in history.

**How to run:** see [README](../blob/main/README.md). The `preview/` folder runs with no dependencies at all — open the HTML file, or `node preview/serve.mjs`.

**Simulated / prepared material:** all *procedurally generated* terrain is invented, not real map data.
Separately, the **Real World** mode uses a built-in vector outline of Eurasia (hand-authored
lat/lon polygons covering Iberia to Japan, 11°W–147°E / 10°N–75°N). That outline is approximate:
it is accurate enough that coastlines and latitude bands are recognisable and that vegetation
zones land in the right place, but it is **not** survey-grade cartography and should not be used
for anything beyond the simulation. The 4-seed average table above was produced by a headless
Node harness, not by clicking — the harness is reproducible from the seed values.

**Map size is adjustable.** The grid runs from 80×50 (800 m × 500 m, 0.40 km²) up to 320×200 (3.20 km × 2.00 km, 6.40 km²), with 160×90 (1.44 km²) as the default. The scale is held fixed at 1 cell = 10 m, so resizing does not rescale the world — it reveals more of it. Area grows with size; the real-world size of a single cell does not change. At the largest setting the map is 6.4 km², which is the same order as a real wildfire, and this is what makes the "why can't they put it out" question tangible rather than abstract.

**Terrain is generated in four stages**, each with a geographic justification: a fractal (fBm) elevation field with ridged sharpening → drainage (rivers walk downhill to the local minimum, lakes pool in basins, floodplains get wetter) → human settlement (towns sited on low, flat, near-water ground; winding forest roads) → a vegetation lookup keyed on elevation and moisture. The point is that every forest patch on the map can be explained by where it is.

**There are two terrain systems, and every map-rebuild path goes through one function.** `buildMap()` dispatches on whether a region is selected: with a region it projects the real-world outline, without one it generates procedural terrain. Every caller — reset, resize, randomise, flavour switch — routes through it. This matters because the failure mode when a caller bypasses the dispatcher is silent: you switch to Eurasia, press reset, and are quietly handed procedural terrain with no error. The same dispatcher is what made the random-map bug fixable in one place instead of four.

**Two entry points, one model.** `app/fire/page.tsx` is the Next.js app; `preview/index.html` is a zero-build single-file version used for the GitHub Pages demo. Both import the same `lib/fireModel.ts`, and `scripts/build-docs.mjs` inlines both `fireModel` and `atlas` into the deployable HTML, which is verified to contain zero external imports. Keeping one model behind two front ends is what makes the headless tests meaningful: they exercise the same code the browser runs.

**Not built:** side-by-side run comparison, the epidemic sandbox, and real terrain
import *beyond* the single built-in Eurasia region (the outline is hand-authored rather
than pulled from a geographic dataset, so adding further regions means adding more
polygons by hand).

## 7. Feedback and iteration

**Feedback obtained so far:** informal, from classmates who watched me run it. Six concrete pieces of feedback that changed the model:

1. *"The fire is too fast — you can't see what's happening."* → Added a speed slider (0.25×–30×) and slowed the base spread probability.
2. *"Why do the firefighters walk through the ashes?"* → This was a real bug. Crews were pathing *onto* target cells and then standing on the ash they created. Fixed by making them stop one cell short and refuse to enter ash. Ash-stepping dropped from 87 events per run to 7.
3. *"The firefighters arrive before the fire even starts."* → Raised the default arrival delay from 3 to 18 turns and extended the slider range to 0–40. This is also what made the delay experiment possible, which became the project's main finding.
4. *"When it rains the whole map turns green and you can't tell what's what."* → Also a real bug, and the most instructive one of the four. The renderer was testing moisture against a single threshold and then **replacing** the vegetation colour outright. Two consequences: every cell above 0.5 moisture became the same green (so a conifer forest, a shrub patch and dry grass all looked identical), and since rain raises moisture field-wide, a few turns of moderate rain repainted the entire map. The fix was to stop treating moisture as a colour and start treating it as a **coat**: the vegetation colour is drawn first and unchanged, then a faint translucent wash is layered on top. The visible lesson is that "it's raining" and "the ground is wet" are two different quantities and needed two different visual channels. A related bug — rain was only drawn while the simulation was running, so pausing made it look like the rain had stopped — came from the same confusion.
5. *"The map isn't anywhere on Earth — can it just be Asia / Eurasia?"* → This is what pushed the project from "a plausible landscape" to "an actual place." See Section 8.
6. *"Why is the random map always the same map? It should follow real terrain logic and it shouldn't look identical every time."* → Two separate problems hiding behind one complaint. See Section 8.

## 8. Making the map a real place

Everything up to this point generated terrain that *looked* like a forest but was not anywhere. That is a reasonable thing to simulate, but it undercuts one of the project's own arguments: the claim that "fire in boreal conifer forest behaves differently from fire in tropical rainforest" only means something if the map actually has a boreal zone and a tropical zone in the right places.

So the map became **Eurasia** — a real region, defined by real coordinates.

**How it works.** `lib/atlas.ts` holds the region as a set of **latitude/longitude polygons**, not an image. Each cell of the grid is converted back to a (lon, lat) pair, and a **ray-casting point-in-polygon test** (even-odd rule) answers "is this on land?". Because the outline is vector data, it stays sharp at any resolution, and nothing is fetched from the network — the whole map is inlined in the page.

The bounding box is `[-11°, 10°, 147°, 75°]`: Iberia in the west, the Malay Peninsula in the south, the Japanese east coast in the east, the Arctic shore in the north. This box is deliberately tight. An earlier, larger box left two-thirds of the map as open ocean — at 120×75, 66.3% of cells were water, so there was barely any land left to burn. Tightening it gave a stable **43.5% land** at every grid size from 80×50 to 320×200.

**Vegetation follows latitude, not randomness.** Humidity and temperature are functions of latitude, matching the real atmospheric circulation bands, and the fuel lookup is keyed on those:

| Latitude | Climate | Fuel |
|---|---|---|
| < 10° | equatorial rainforest | broadleaf, permanently wet |
| 18°–30° | subtropical dry belt | dry grass / barren (Sahara, Arabia) |
| 30°–40° | Mediterranean | shrub and grass |
| 40°–55° | temperate westerlies | broadleaf and mixed forest |
| 55°–65° | boreal | conifer (the Siberian belt) |
| > 65° | tundra | low shrub, bare ground |

Measured against the generated map, the bands come out right: the subtropical band is 95% dry grass, the temperate band is 81% broadleaf + 16% conifer, and the boreal band is 85% conifer. Conifer share rises monotonically with latitude (85% boreal vs 16% temperate), which is the check that the gradient is real and not an artefact.

**The hard part was geometry, not climate.** The polygons have to be self-intersection-free, because under the even-odd rule a self-crossing outline flips its interior: any region crossed an even number of times is treated as "outside", so a wandering path can carve a phantom island out of what should be sea. This showed up in testing as a bogus land mass sitting in the middle of the Sea of Okhotsk. The fix was architectural rather than local: each landmass became **one outer coast ring plus separate holes for inland seas**, and the return leg of any path was routed so that it never crosses its own outbound leg. Getting Kamchatka right took about eight attempts before the two meridians were parallel-but-distinct rather than shared. The final count is **zero self-intersections across all 23 land polygons and all inland lakes**.

## 9. Why the random map was always the same map

The same feedback round produced a second, unrelated complaint: the random map always looked identical. This turned out to be **two** bugs, only one of which was where I expected to find it.

**Bug 1 — the seed was never advanced.** The randomise button rebuilt the terrain from the *current* seed without changing it. So the generator was never actually being asked for a new map: it faithfully produced the same map every time, because it was given the same input every time. This is worth stating plainly because it is the kind of defect that looks like "the noise algorithm is degenerate" and is actually "the button is wired wrong." Before changing any generation code I measured the generator itself — randomly-seeded maps differed from one another by ~75% of their cells — which localised the fault to the wiring.

**Bug 2 — the seed-advance formula was losing entropy.** The old advance was `(seed * 1103515245 + 12345) & 0x7fffffff`. In JavaScript all numbers are float64 with a 53-bit mantissa, and `seed * 1103515245` overflows that almost immediately. The low bits of the product are silently discarded, so each step threw away roughly half the entropy. The replacement uses **`Math.imul`**, which is the only way to get a real 32-bit integer multiply in JS, inside a **three-round splitmix32-style mix**. One round was not enough: 2000 consecutively advanced seeds did not collide, but the *high* bits were not being filled (only 256 of 512 possible values in the top nine bits) — and the high bits are exactly what a fractal noise lookup table consumes, so under-mixed seeds produce maps with recognisable shared structure. After three rounds, 2000 steps give zero collisions and the bit distribution is uniform to within 2.3%.

**Bug 3 — masking to 31 bits broke my own test.** `nextSeed` returns a 31-bit value, so bit 31 is always zero. My assertion was reading "the top nine bits" as `>>> 23`, which includes that permanently-zero bit — capping the achievable value count at 2⁸ = 256 no matter how good the generator was. The implementation was fine; the test was measuring the mask rather than the entropy. Reading bits 30..22 instead gives 504/512. I record this because I nearly rewrote working code to satisfy a broken assertion.

**Feature — terrain *flavours*.** Advancing the seed alone fixes "same map twice," but not "feels the same." Every map still came from one parameter set: five fBm octaves, base frequency 2.6, water level ~0.13–0.20, one to three rivers. Three maps in a row felt like the same map with the details moved around. So terrain now has six named **flavours** — 连绵山脊 (continuous ridges), 河谷盆地 (river basin), 高原缓坡 (open plateau), 湖沼密布 (lake country), 干旱疏林 (arid open woodland), 连片密林 (dense conifer forest) — each with its own elevation, drainage, settlement and vegetation parameters. Randomising picks a flavour *excluding the current one*, so consecutive presses genuinely change the character of the place.

Two tuning notes from building those flavours, both of which were initially wrong on screen:

- The river basin flavour at `waterLevel: [0.20, 0.28]` **drowned 28% of the map**. Water is unburnable, so a quarter of the grid being sea means the fire has nowhere to go and the scenario stops being interesting. Lowered to `[0.15, 0.21]`.
- The dense-forest flavour only reached 17% conifer, despite its name. Lowering the moisture thresholds was not sufficient, because thresholds only reclassify the mid-elevation band — the hill and lowland bands, which together are half the map, were untouched. Fixing it needed a **separate mechanism**: an explicit tree-line test (enough moisture and not too high → tree), with the forest bias controlling how permissive it is and elevation deciding conifer-versus-broadleaf. That took conifer coverage from 17% to 53%.

The upshot is measured, not asserted: clicking randomise six times produces six different maps spanning five different flavours, and across 6000 samples the six flavours come out between 16.1% and 17.2% of the time each (a uniform share would be 16.7%).

**What is genuinely reassuring here** is the reproducibility half. The same seed and the same flavour still give a byte-identical map, which is what makes the experiments above repeatable. Variety and reproducibility are not in tension as long as the seed is the single source of truth — it just has to be a seed that actually changes.

**What I plan to change next:**

- **Build the epidemic sandbox**, reusing the same grid and the same seeded-PRNG harness so results are comparable across the two.
- **Add a side-by-side comparison** so two parameter sets can be run and charted in one view instead of exporting and comparing by hand.
- **Make firebreak width matter.** This is the clearest remaining defect in the model. Widening a wet line barely helps: in a uniform conifer stand with a strong wind, going from 0 cells wide to 6 cells wide cut the area burned beyond the line only from 1948 cells to 1638 — about 16%. The reason is that spotting (`emberRate`) fires embers purely as a probability, with no notion of the distance they travel. So a firebreak is effectively binary: it either happens to hold or it does not, and its width contributes almost nothing. In a real fire, width is the whole point. Fixing this means giving embers a travel distance and making the crossing probability fall off with it.
- **Calibrate the wet-line drying time** against something real, or clearly label it as a gameplay parameter in the UI. Right now it is tuned by feel.
- **Add more real regions.** The mechanism is in place and adding a region is now a bounded task: author the coastline as polygons, make sure they do not self-intersect, and give the region a bounding box tight enough that most of the grid is land. Somewhere genuinely different from Eurasia — Australia, or the west coast of North America — would stress-test whether the latitude-based vegetation rules generalise or whether they have quietly been tuned to one continent.

**What I would do differently.** Three of the bugs in this project were found by *measuring the suspect component in isolation* rather than by reading code: the random-map bug, the day-one terrain-height bug, and the self-intersecting coastline were all located in minutes once I wrote a harness that printed the actual numbers. I now write the harness first. The contrasting failures are the ones where I reasoned from a plausible-sounding theory instead — the "66% water means the projection is broken" theory cost real time before a direct comparison showed the projection was exactly right and the bounding box was simply too big.

> No formal feedback from the teacher yet at the time of writing.

---

## Summary of my understanding

What I set out to test was a slogan: *"attack fires early."* I did not need a simulation to repeat it — I needed one to tell me **how much** early matters and **when** late becomes equivalent to never. The model gave a specific, checkable answer: 18 turns late ≈ no crews at all, and early beats numerous.

The part that genuinely changed my thinking is how *little* of the fire's behaviour is designed. I wrote rules for one cell and its eight neighbours. I never wrote anything that says "the fire should form a jagged front," or "a firebreak should hold," or "the burned area should be roughly circular and drift downwind." Those all appeared on their own. Every one of them is a consequence of the local rules, not a line of code.

The wet firebreak is the clearest example. I added a rule — *this cell does not burn for 24 turns* — and a completely different behaviour showed up: the fire stops, the line holds under pressure, and then it fails. The failure was not written anywhere. It is just what happens when the fire outlasts the break.

Checking AI's summaries against my own results turned out to be necessary, not optional. Two claims I was given were wrong about my own model: that the "auto" tactic fought fires and laid firebreaks simultaneously (**it did not** — it switched permanently to firebreak-only once the fire front exceeded 22 cells, so "suppressed fires" was silently always zero), and that more crews always means less damage (**8 late crews did worse than 4 late crews**). Both were caught by running the model rather than by reading about it.

That is the thing worth keeping: the model is a place where I can be wrong cheaply and find out quickly. A slogan sounds correct forever. A number can be checked.
