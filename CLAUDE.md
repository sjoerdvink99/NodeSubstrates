# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Managers

- Use `uv` instead of `pip` for Python packages
- Use `bun` and `bunx` instead of `npm` and `npx` for JavaScript packages

## Build Commands

```bash
bun run build       # Production bundle (esbuild → js/dist/index.js)
bun run dev         # Watch mode
bun run typecheck   # TypeScript type checker
bun run lab         # Start Jupyter Lab on port 8888
uv run pytest                          # All Python tests
uv run pytest tests/test_widget.py     # Single test file
uv run pytest tests/test_widget.py::test_name  # Single test
```

## Required Checks

Always run `bun run typecheck` after any TypeScript changes. Must pass before considering changes complete.

## Code Style

- No comments in code
- No docstrings

## Architecture

NodeSubstrates is a Jupyter widget combining force-directed node-link diagrams with dimensionality-reduction "substrate" regions. Python (`src/node_substrates/widget.py`) handles graph data and DR computation via anywidget; TypeScript (`js/`) handles all rendering and interaction.

### Python ↔ JavaScript Communication

anywidget syncs traits bidirectionally as JSON. The main traits:
- `nodes`, `edges`, `substrates` — graph data (Python → JS on change)
- `selected_nodes` — current selection (bidirectional)
- `command` — action dispatch (JS → Python requests; Python → JS confirmations)
- `ready` — loading gate; JS ignores trait changes while `ready=False`

**Command pattern**: JS sends requests by setting `model.set("command", {action: "request_*", ...})`. Python handles them in `_handle_command`, performs computation, updates traits, then echoes a confirmation command (e.g. `{action: "create_substrate", substrate_id: ...}`). JS listens on `change:command` to react to confirmations.

### Two Parallel Data Models

There are two separate node representations that must stay in sync:

- `Node` / `WidgetState` — the serialised model data from Python, with raw `x`/`y` positions
- `NodeState` / `AppState` — the frontend simulation state, which extends `Node` with D3 simulation fields (`vx`, `vy`, `fx`, `fy`) and substrate membership (`isInSubstrate`, `substrateId`)

`StateManager.updateFromModel()` merges incoming `Node` data into existing `NodeState` objects, preserving simulation velocity and pinned positions. `applySubstrateConstraints()` sets `isInSubstrate`/`substrateId` and pins (`fx`/`fy`) nodes to their DR-projected positions — it iterates over `substrate.projections`, **not** `substrate.node_ids`, so nodes without computed projections will have `isInSubstrate = false` even if they appear in the substrate.

### SVG Layer Stack (Z-order, bottom → top)

Layers are appended in this order inside `mainGroup` by `RenderManager`:

1. `interaction-layer` — lasso selection polygon
2. `substrates-layer` — substrate rectangles, labels, settings icon
3. `edges-layer` — topological, intra, and inter edges
4. `nodes-layer` — node circles and labels
5. `substrate-handles-layer` — resize corner handles
6. `cross-edges-layer` — cross edges (one endpoint inside a substrate, one outside); rendered last so they appear on top of substrate fills

`EdgeRenderer` classifies each edge on every render call and routes cross edges to `crossGroup` (`cross-edges-layer`) and all others to `group` (`edges-layer`). `updatePositions()` (called on every simulation tick) updates path geometry in-place without re-sorting edges between groups — reclassification only happens during full `render()` calls.

### Substrate Projection Coordinate System

Projections from DR are normalised to `[-1, 1]` × `[-1, 1]`. The mapping to canvas coordinates is:

```
x_canvas = bounds.x + SUBSTRATE_PADDING + ((proj.x + 1) / 2) * (bounds.width  - SUBSTRATE_PADDING * 2)
y_canvas = bounds.y + SUBSTRATE_PADDING + ((proj.y + 1) / 2) * (bounds.height - SUBSTRATE_PADDING * 2)
```

`SUBSTRATE_PADDING = 40` (from `CONSTANTS` in `js/types.ts`). This same formula appears in both `StateManager.applySubstrateConstraints` and `RenderManager.animateToSubstrate`.

### Rendering Pipeline

`RenderManager.render(state)` is the full render: substrates → edges (classify + route) → nodes.  
`RenderManager.tick(state)` is the per-frame update during simulation: positions only, no re-classification.  
`RenderManager.animateLayoutChange` and `animateToTargetPositions` run D3 transitions and call `render()` on completion.

Panels (`DetailPanel`, `AlgorithmModal`, `SettingsModal`, `SelectionPopover`) are HTML overlays positioned absolutely inside `vizContainer`. They communicate back via callbacks passed at construction in `js/index.ts`.
