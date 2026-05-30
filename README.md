# NodeSubstrates

![NodeSubstrates overview](docs/overview.png)

A Jupyter widget for hybrid graph visualization that combines force-directed node-link diagrams with dimensionality-reduction (DR) based semantic substrates. Users interactively select node communities and embed them into attribute-space layouts while preserving the topological context of the full graph.

## Features

- **Hybrid layout** — force-directed node-link diagram with embedded DR substrate regions
- **Three DR methods** — PCA, UMAP, and t-SNE
- **Interactive substrate creation** — lasso selection or right-click context menu
- **Animated transitions** — smooth interpolation between layout states
- **Auto-detection** — community-based substrate suggestions scored by attribute structure
- **Node encoding** — color and size nodes by any numeric or categorical attribute
- **Focus mode** — highlight substrate neighborhoods to reduce visual clutter
- **Node2Vec support** — embed structural node embeddings as attributes for DR

## Installation

```bash
pip install node-substrates
```

Or from source:

```bash
git clone https://github.com/sjoerdvink99/node-substrates.git
cd node-substrates
uv sync
```

## Quick Start

```python
import networkx as nx
from node_substrates import NodeSubstratesWidget

G = nx.karate_club_graph()
for node in G.nodes():
    G.nodes[node]['degree'] = G.degree(node)
    G.nodes[node]['clustering'] = nx.clustering(G, node)

widget = NodeSubstratesWidget(G)
widget
```

### Creating Substrates

```python
widget.create_substrate([0, 1, 2, 3, 4], dr_method='umap', label='Core')

widget.accept_suggestion(0)

widget.dissolve_substrate('substrate_0')
```

### Using Built-in Datasets

```python
from node_substrates import load_cora_network, load_coauthorship_sample

G = load_cora_network()
widget = NodeSubstratesWidget(G)

G = load_coauthorship_sample(n_authors=150)
widget = NodeSubstratesWidget(G)
```

### Programmatic Access

```python
substrate = widget.substrate(0)
print(substrate.node_ids)
print(substrate.dr_method)

fig = substrate.plot(color_by='degree')

expanded = widget.expand_selection(hops=2)
widget.create_substrate(expanded, dr_method='pca')
```

## Architecture

NodeSubstrates uses [anywidget](https://anywidget.dev/) to bridge Python and JavaScript:

- **Python** (`src/node_substrates/`) — graph data management, DR computation via scikit-learn and umap-learn, substrate candidate detection
- **TypeScript** (`js/`) — D3.js force simulation, SVG rendering, interaction handling

Trait changes flow bidirectionally via JSON serialization. The `command` trait dispatches actions from JavaScript to Python (requests) and Python to JavaScript (confirmations).

## Development

```bash
bun install
bun run build       # production bundle
bun run dev         # watch mode
bun run typecheck   # TypeScript type checking
uv run pytest       # Python tests
uv run ruff check src/ tests/
```

## Examples

The `examples/` directory contains Jupyter notebooks demonstrating the widget with several datasets:

| Notebook | Dataset |
|---|---|
| `basic_usage.ipynb` | Karate club graph |
| `coauthorship_network.ipynb` | IEEE VIS co-authorship |
| `cora_publicationnetwork.ipynb` | CORA citation network |
| `insurance_fraud.ipynb` | Insurance fraud network |
| `zinc_molecules.ipynb` | ZINC molecular graphs |

## Citation

If you use NodeSubstrates in your research, please cite:

```bibtex
@inproceedings{vink2026nodesubstrates,
  title     = {NodeSubstrates: Bridging Node-Link Diagrams with DR-Based Semantic Substrates},
  author    = {Vink, Sjoerd and Christino, Leonardo and Behrisch, Michael},
  booktitle = {EuroVis 2026},
  publisher = {The Eurographics Association},
  year      = {2026},
}
```

## References

- Henry & Fekete (2007). [NodeTrix: A Hybrid Visualization of Social Networks](https://dl.acm.org/doi/10.1109/TVCG.2007.70582). *IEEE TVCG*
- Shneiderman & Aris (2006). [Network Visualization by Semantic Substrates](https://pubmed.ncbi.nlm.nih.gov/17080794/). *IEEE TVCG*

## License

MIT — see [LICENSE](LICENSE)
