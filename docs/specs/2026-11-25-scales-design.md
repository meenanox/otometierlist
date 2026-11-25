# Scales: Spectrum, Radar and Alignment modes

Status: approved and built. Differences from the draft: a slider panel for exact scores replaces double-click; the pool bar offers All / One / Several games.

## Goal

Let people rate routes on opposite-ended scales (Fluff ↔ Serious, Cute ↔ Spice, and their own) and see the result as three charts: a spectrum line, a radar chart and an alignment grid. Each chart exports as a picture like the existing modes.

## Non-goals

- No per-aspect KoiLog ratings (appearance, storyline and so on). Those stay as they are.
- No hosted accounts or sharing links.
- No change to the Tier, Venn, Axis or Awards modes.

## What the user chose

- Three new modes in the top bar: **Spectrum**, **Radar**, **Alignment**.
- Rating is done by clicking or dragging on the chart, with the number shown while dragging.
- Scores allow half steps (3.5 / 10).
- The pool can show completed routes only, several games at once, or a single game.
- Starting scales: Fluff ↔ Serious and Cute ↔ Spice. Users can add, rename, reorder and delete scales.

## Design

### Shared by all three modes (one rating set)

A route is a character in a game, keyed `<charKey>@<game>`, so one character can have different ratings in different games. Ratings are entered once and appear in all three charts.

State, stored in the Characters list (added to `LIST_KEYS`, so it swaps with the list):

```
state.scales = {
  list:    [{ id, lo: "Fluff", hi: "Serious" }, { id, lo: "Cute", hi: "Spice" }],
  ratings: { "<charKey>@<game>": { <scaleId>: 0..10 in 0.5 steps } },
  pool:    { games: [] /* empty = all games */, completedOnly: false },
  spectrum:{ scale: <scaleId> },
  radar:   { routes: [<routeKey>, ...], scales: [<scaleId>, ...] },
  align:   { x: <scaleId>, y: <scaleId>, cuts: [3.5, 6.5], names: [9 strings] }
}
```

A score is 0–10; the right-hand label is the high end. Unrated is absent, not 0. Saved state drops empty entries (same slimming as items).

### Pool bar (shown in all three modes)

One bar with: games (pick one, several, or all), a "Completed routes only" switch, and the usual search. The pool shows one card per character-game pair. "Completed" uses the KoiLog route status (fully completed, or completed at least once). Routes imported from VNDB have no status, so they count as completed only if the user marks them; with the switch on they are hidden otherwise.

### Spectrum

One scale as a horizontal line, low label left and high label right. Route cards sit on the line at their score. Click or drag on the line to place a card; the score shows while dragging, snapping to 0.5. Scale picker above the line. Cards that land on the same score stack.

### Radar

One spoke per scale (3 to 8 scales). Pick up to 4 routes to overlay as coloured polygons with a legend. Click or drag a polygon's point on a spoke to rate that route on that scale. If fewer than 3 scales exist the mode asks for a third.

### Alignment

Two scales, one per axis, make a 3×3 grid. Cells are low / middle / high on each axis using cut-offs of 3.5 and 6.5 (adjustable). The user names all nine cells (defaults provided, such as "Soft and sweet"). Cards sit in the cell their scores put them in; dragging a card between cells sets its scores to that cell's centre, and a double click opens exact scores.

### Export

Three new renderers in `export.js` (`renderSpectrumImage`, `renderRadarImage`, `renderAlignImage`) using the existing 8 styles, sizes, card options and header/footer. `renderImage()` dispatches on mode.

## Calls I made (change any of them)

- Alignment cut-offs 3.5 and 6.5.
- Radar limit of 8 scales and 4 overlaid routes.
- Pool shows each character-game pair as its own card.
- Unmarked VNDB routes are hidden when "Completed routes only" is on.
- Dragging in the alignment grid sets scores to the cell centre.

## Risks

- Saved state grows with ratings; slimming keeps it small. Ratings stay separate from items so the full-storage warning still applies.
- Three modes share one pool bar, so the bar and `renderPool()` need a mode-aware filter instead of three copies.

## Build order

1. State, scale editor, pool bar and route cards.
2. Spectrum (simplest chart, proves the rating gesture).
3. Radar.
4. Alignment.
5. Exports for all three, then a README update and the zip.
