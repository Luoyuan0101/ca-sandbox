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
| Next.js + Canvas 2D docs | Technical: how to render 4000 cells at 60fps without React re-rendering every cell. |
| `pptxgenjs` / `docx` docs | How to generate real, editable files (not screenshots) in the browser for the experiment report. |

**Reusable pieces I kept:** the seeded PRNG (mulberry32) pattern for reproducible experiments, the five-state chain design, and the idea of separating "the model" from "the view" so the model can be run headless in Node for testing.

**What I deliberately did not reuse:** any pre-built fire simulator. I wanted the rules to be mine so that when the result surprised me I would know exactly which line caused it.

## 3. Narrow down

The scope was cut in three passes.

**Cut 1 — one hazard, not two.** The original idea was "wildfire *and* epidemic." I built the fire sandbox first and the epidemic one is still a placeholder page. Two half-built sandboxes are worth less than one sandbox I can defend line by line.

**Cut 2 — 80×50, not a real map.** I do not have real terrain data, and importing it would have consumed the whole project. A fixed 80×50 grid with procedurally generated coherent terrain is enough to show the phenomenon. **Scale: 1 cell = 10 m, so the whole map is 800 m × 500 m ≈ 0.40 km².** That is a plausible "local fire" — a small forest block or a grass field. Real megafires are several thousand times that, so the project is explicitly about *regimes and trends*, not about predicting a specific real fire.

**Cut 3 — the question, made concrete.** The specific claim I wanted to test:

> Two identical fires. Same terrain, same weather, same seed. The only difference is **when the fire crew arrives**.
> Does arrival time change the outcome, and does "early" beat "many"?

Concrete scenario: a lightning strike at the centre of a mixed grass/conifer map, 2–8 crews arriving after a configurable delay of 0–40 turns. Measure burned fraction.

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

- One sandbox (wildfire), 80×50 grid
- Five-state combustion with fuel types, moisture, humidity, wind, rain
- Crew on/off toggle + configurable count, speed, arrival delay, and tactic
- Run/pause, adjustable simulation speed (0.25×–30×)
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
| Model core — states, spread probability, crews, terrain generation | [`lib/fireModel.ts`](../blob/main/lib/fireModel.ts) (~1250 lines) |
| Export — PPT / Word / CSV / JSON | [`lib/export.ts`](../blob/main/lib/export.ts) |
| Fire sandbox page | [`app/fire/page.tsx`](../blob/main/app/fire/page.tsx) |
| Canvas renderer (4000 cells) | [`components/FireCanvas.tsx`](../blob/main/components/FireCanvas.tsx) |
| Parameter panel | [`components/ControlPanel.tsx`](../blob/main/components/ControlPanel.tsx) |
| Terrain editor | [`components/TerrainEditor.tsx`](../blob/main/components/TerrainEditor.tsx) |
| Live chart | [`components/StatsChart.tsx`](../blob/main/components/StatsChart.tsx) |
| Zero-install demo (no build step) | [`preview/index.html`](../blob/main/preview/index.html) |
| Epidemic sandbox | [`app/disease/page.tsx`](../blob/main/app/disease/page.tsx) — **placeholder, not built** |

**How to run:** see [README](../blob/main/README.md). The `preview/` folder runs with no dependencies at all — open the HTML file, or `node preview/serve.mjs`.

**Simulated / prepared material:** all terrain is procedurally generated, not real map data. The 4-seed average table above was produced by a headless Node harness, not by clicking — the harness is reproducible from the seed values.

**Not built:** real terrain import, side-by-side run comparison, the epidemic sandbox.

## 7. Feedback and iteration

**Feedback obtained so far:** informal, from classmates who watched me run it. Three concrete pieces of feedback that changed the model:

1. *"The fire is too fast — you can't see what's happening."* → Added a speed slider (0.25×–30×) and slowed the base spread probability.
2. *"Why do the firefighters walk through the ashes?"* → This was a real bug. Crews were pathing *onto* target cells and then standing on the ash they created. Fixed by making them stop one cell short and refuse to enter ash. Ash-stepping dropped from 87 events per run to 7.
3. *"The firefighters arrive before the fire even starts."* → Raised the default arrival delay from 3 to 18 turns and extended the slider range to 0–40. This is also what made the delay experiment possible, which became the project's main finding.

**What I plan to change next:**

- **Build the epidemic sandbox**, reusing the same grid and the same seeded-PRNG harness so results are comparable across the two.
- **Add a side-by-side comparison** so two parameter sets can be run and charted in one view instead of exporting and comparing by hand.
- **Calibrate the wet-line drying time** against something real, or clearly label it as a gameplay parameter in the UI. Right now it is tuned by feel.

> No formal feedback from the teacher yet at the time of writing.

---

## Summary of my understanding

What I set out to test was a slogan: *"attack fires early."* I did not need a simulation to repeat it — I needed one to tell me **how much** early matters and **when** late becomes equivalent to never. The model gave a specific, checkable answer: 18 turns late ≈ no crews at all, and early beats numerous.

The part that genuinely changed my thinking is how *little* of the fire's behaviour is designed. I wrote rules for one cell and its eight neighbours. I never wrote anything that says "the fire should form a jagged front," or "a firebreak should hold," or "the burned area should be roughly circular and drift downwind." Those all appeared on their own. Every one of them is a consequence of the local rules, not a line of code.

The wet firebreak is the clearest example. I added a rule — *this cell does not burn for 24 turns* — and a completely different behaviour showed up: the fire stops, the line holds under pressure, and then it fails. The failure was not written anywhere. It is just what happens when the fire outlasts the break.

Checking AI's summaries against my own results turned out to be necessary, not optional. Two claims I was given were wrong about my own model: that the "auto" tactic fought fires and laid firebreaks simultaneously (**it did not** — it switched permanently to firebreak-only once the fire front exceeded 22 cells, so "suppressed fires" was silently always zero), and that more crews always means less damage (**8 late crews did worse than 4 late crews**). Both were caught by running the model rather than by reading about it.

That is the thing worth keeping: the model is a place where I can be wrong cheaply and find out quickly. A slogan sounds correct forever. A number can be checked.
