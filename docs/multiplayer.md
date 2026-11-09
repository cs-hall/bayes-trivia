# Bayes-trivia multiplayer: design

Status: **design agreed, not yet implemented.** This document settles the
gameplay and the posterior maths. Rooms, turn sync and privacy are the next
design step (see [Next steps](#next-steps)).

## Contents

- [Gameplay](#gameplay)
- [Information and posteriors](#information-and-posteriors)
- [Scoring and awards](#scoring-and-awards)
- [The sampler](#the-sampler)
- [Next steps](#next-steps)

---

## Gameplay

### Setup

- 2–6 players, **each on their own device**.
- Each player has their **own timeline**, starting with one face-up card
  (Chronology-style).
- No lives. The race is to correctly place **10 cards**.
- Before play starts, **every player sets a private prior for every starting
  card** — their own and everyone else's.

### A turn

1. A new card is shown to everyone.
2. **Every player privately sets a prior** for it (year ± years). The prior
   locks once submitted. **Play waits until all priors are in** — no timer.
3. The active player places the card in **their own** timeline.
4. **Right:** the card stays in their timeline and counts towards their 10.
5. **Wrong:** the card goes round the table as bonus turns (below).

All placement attempts — the slot chosen and the result — are **visible to
everyone live**.

### Bonus loops for a missed card

Starting with the player after the active player, the card goes round the
table twice. Each player tries it in their own timeline.

| Loop                                           | On a miss the game reveals…                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| **First loop** (ends with the original player) | only **"wrong"**                                                              |
| **Second loop**                                | **the correct slot** in that player's timeline (the card does not stay there) |

- Whoever places it correctly first keeps it (it counts towards their 10).
- So every player gets up to **two attempts** at a missed card. If nobody
  places it in two attempts each, the card is **discarded**. Everything learnt
  from the attempts still counts.
- Bonus turns are **free**: they don't cost the player their normal turn.
  Once the card is resolved, play picks up where it left off — with the player
  after the original active player.

### End of the game

- When a player reaches 10 correctly placed cards, the **round is finished**
  so everyone has had the same number of turns.
- Then all years are revealed and the awards are given.

### Awards

| Award                   | Decided by                                                                   |
| ----------------------- | ---------------------------------------------------------------------------- |
| **Winner** (main award) | Most cards correctly placed. Ties broken by best posterior score.            |
| **Best priors**         | Highest average log score of the player's priors at the true years           |
| **Best posteriors**     | Highest average log score of the player's final posteriors at the true years |

Scores are computed over **every card dealt** in the game: all timelines'
cards, starting cards and discarded cards.

---

## Information and posteriors

### Public facts

Every event adds a public fact about the hidden (integer) years:

| Event                                | Fact learnt about the card's year _X_                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Card in a timeline                   | Strict order with its neighbours: _a_ < _X_ < _b_                                   |
| Correct placement in slot (_a_, _b_) | _a_ < _X_ < _b_ (the card joins that timeline)                                      |
| First-loop miss in slot (_a_, _b_)   | **not** in that slot: _X_ < _a_ **or** _X_ > _b_                                    |
| Second-loop miss                     | between the two cards that bound the correct slot in that timeline: _c_ < _X_ < _d_ |

Plus, as in single-player, **no year is later than the current year**.

### Private priors, private posteriors

Each player's posterior over all hidden years is

> p(years | facts) ∝ ∏ over cards N(year; μ, σ) × 1[all public facts hold]

using **that player's own priors** and **everyone's public facts**.
So information from one player's attempt helps every player's next guess and
updates the posteriors of every player's cards — but two players with different
priors still see different posteriors. Priors stay private until the reveal.

### Why sampling, not the single-player calculation

Single-player uses an exact forward–backward pass along the timeline: every
fact involves two neighbouring cards, so a "note" of one card's year
(one number per year) can be passed along the line.

In multiplayer, a missed card links timelines. For example, Alice has
_a1_ < _a2_; card _X_ misses in that slot ("_X_ < _a1_ or _X_ > _a2_") and is
then placed by Bob between _b1_ and _b2_:

```
Alice:  a1 ───── a2
          \     /
           \   /      "X not between a1 and a2"
             X
             │        "b1 < X < b2"
Bob:    b1 ──┴── b2
```

The fact about _X_ ties three cards together, so the note passed from _a1_ to
_a2_ must describe _a2_ and _X_ **jointly** — a table of
1,000 × 1,000 numbers (for a 1,000-year span at year resolution)
instead of 1,000. Each further cross-link can add another card to the table
(1,000³, 1,000⁴, …), which a game with many misses would quickly outgrow.
Sampling handles every case the same way, so **we always sample**.

---

## Scoring and awards

**Log score.** For a card with true year _y_, a belief is scored by the log of
the probability it gave to that exact year:

- **Prior:** log P(_y_) under the player's prior, discretised to whole years
  (N(μ, σ) mass on [*y* − ½, *y* + ½], truncated at the current year).
- **Posterior:** log of the player's final posterior probability of year _y_
  for that card, from the end-of-game sampler run (20,000 samples, below).

A player's prior or posterior score is the average over all cards dealt.
Higher (less negative) is better. The log score is a proper scoring rule: it is
best to report your honest belief, and it punishes overconfidence hard — a
narrow prior that misses scores very badly. That is intended; players should
avoid being overconfident. There is no cap.

At the reveal, show each player their per-card scores (and their worst card) so
the awards are easy to understand.

---

## The sampler

### Model

- **Resolution: whole years.** Every hidden year is an integer.
- Each device samples **only its own player's** posterior (it depends on that
  player's private priors). Budget: **up to ~60 cards per device**, all players'
  cards included.

### Method: Gibbs sampling

Each step updates one card's year given all the others. Given the others, a
card's allowed years are a set of intervals (from its order facts, the "not in
this slot" facts, and the current-year cap). Its conditional distribution is
its prior restricted to those intervals:

> P(_X_ = _k_) ∝ Φ((_k_ + ½ − μ)/σ) − Φ((_k_ − ½ − μ)/σ), _k_ in the allowed intervals

which is sampled exactly with an inverse-CDF draw (pick an interval by its prior
mass, draw a continuous truncated normal in it, round to the year). A "not in
this slot" fact gives two intervals, so a card can jump straight from one side
to the other.

A **sweep** updates every card once; one sweep gives one sample per card.

### Sample counts

Prototype benchmark: a 60-card timeline at year resolution, compared with the
exact single-player answer on the same board (worst case over 5 runs; typical
cards are far better):

| Samples per card | Time (desktop) | Worst card's mean error | Worst card's ± error | Slot odds error |
| ---------------- | -------------- | ----------------------- | -------------------- | --------------- |
| 1,000            | 12 ms          | 22% of its ±            | 11%                  | 0.4 points      |
| 2,000            | 23 ms          | 18%                     | 10%                  | 0.4 points      |
| **5,000**        | **42 ms**      | **9%**                  | **6%**               | **0.2 points**  |
| 10,000           | 81 ms          | 7%                      | 5%                   | 0.2 points      |

**Decision:**

- **During play: 5,000 samples per card** (after 500 burn-in sweeps).
  Estimated 150–250 ms on a phone (phones are ~3–5× slower than the desktop
  benchmark; to be confirmed on devices).
- **For the final scores: 20,000 samples per card**, once (~1 s on a phone).

Doubling beyond 5,000 buys little (worst card 9% → 7% of its ±), and slot odds
are already within a fifth of a percentage point.

### Keeping it smooth and fast

- **Background thread.** The sampler runs in a Web Worker, so dragging and the
  prior slider never stutter.
- **Progressive results.** Show results after ~1,000 samples, then refine to
  5,000.
- **Warm start.** Re-run only when a new fact arrives (a placement or a miss),
  starting from the previous run's state.
- **Smooth year-level curves (Rao–Blackwellisation).** Instead of counting how
  often each year is sampled (jagged at 5,000 samples over hundreds of years),
  each step averages the card's exact year-by-year conditional curve given its
  neighbours. Same samples, smooth curves.
- **Instant slider.** Slot odds for a new card are averaged over the stored
  samples of its neighbours' years, so moving the prior slider needs no new
  sampling run. The existing panel code (curves, fuzzy slot bands, "correct N%
  of the time") keeps working on top of this.
- **Year cap.** No year is later than the current year (a bug in the first
  prototype run was exactly this missing cap).

### Tests

- On single-timeline boards the sampler must match the exact forward–backward
  answer (means, ±, slot odds) within the tolerances in the table above. This
  becomes a permanent test.
- Multiplayer boards with "not in this slot" misses and cross-linked timelines
  are checked against brute-force rejection sampling on small boards.
- The log-score functions are checked against hand-computed values.

---

## Next steps

Implementation design, still to be agreed:

- **Rooms:** creating and joining a game from separate devices.
- **Turn sync:** a shared game state (cards, timelines, attempts, whose turn)
  kept in step across devices; handling reconnects.
- **Private priors:** priors are submitted privately and only revealed at the
  end; the server must never send one player's priors to another before the
  reveal.
- **Where the shared state lives:** the site is currently a static GitHub Pages
  build, so multiplayer needs a small realtime backend.
