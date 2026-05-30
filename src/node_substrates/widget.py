import pathlib
import random
import sys
from typing import List, Dict, Optional, TYPE_CHECKING

import anywidget
import networkx as nx
import numpy as np
import traitlets

from .types import DRMethod
from .utils.graph_conversion import networkx_to_widget_format, widget_to_networkx, compute_layout
from .dr import compute_projection
from .detection import detect_substrate_candidates

DETAIL_PANEL_WIDTH = 280

if TYPE_CHECKING:
    import matplotlib.pyplot as plt


class SubstrateView:

    def __init__(self, data: Dict, widget: "NodeSubstratesWidget"):
        self._data = data
        self._widget = widget

    @property
    def id(self) -> str:
        return self._data["id"]

    @property
    def node_ids(self) -> List[str]:
        return self._data["node_ids"]

    @property
    def projections(self) -> List[Dict]:
        return self._data["projections"]

    @property
    def dr_method(self) -> str:
        return self._data["dr_method"]

    @property
    def label(self) -> str:
        return self._data["label"]

    @property
    def bounds(self) -> Optional[Dict]:
        return self._data.get("bounds")

    def __getitem__(self, key):
        return self._data[key]

    def __repr__(self):
        return f"SubstrateView(id={self.id!r}, label={self.label!r}, nodes={len(self.node_ids)})"

    def show(self, width: int = 400, height: int = 400) -> "NodeSubstratesWidget":
        node_ids_set = set(self.node_ids)
        substrate_nodes = [n for n in self._widget.nodes if n["id"] in node_ids_set]
        substrate_edges = [
            e for e in self._widget.edges
            if str(e["source"]) in node_ids_set and str(e["target"]) in node_ids_set
        ]

        mini_widget = NodeSubstratesWidget(width=width, height=height)
        mini_widget.nodes = substrate_nodes
        mini_widget.edges = substrate_edges
        mini_widget.substrates = [self._data]
        mini_widget.ready = True

        return mini_widget

    def plot(
        self,
        figsize=(8, 8),
        show_labels: bool = True,
        show_edges: bool = True,
        color_by: Optional[str] = None,
        title: Optional[str] = None,
    ) -> "plt.Figure":
        import matplotlib.pyplot as plt

        projections = {p["id"]: (p["x"], p["y"]) for p in self.projections}
        node_ids = self.node_ids
        node_map = {n["id"]: n for n in self._widget.nodes}

        colors = None
        if color_by:
            colors = [
                node_map[nid]["attributes"].get(color_by, 0)
                for nid in node_ids if nid in node_map
            ]

        fig, ax = plt.subplots(figsize=figsize)

        if show_edges:
            node_set = set(node_ids)
            for edge in self._widget.edges:
                src, tgt = str(edge["source"]), str(edge["target"])
                if src in node_set and tgt in node_set:
                    if src in projections and tgt in projections:
                        p1 = projections[src]
                        p2 = projections[tgt]
                        ax.plot([p1[0], p2[0]], [p1[1], p2[1]],
                               'gray', alpha=0.3, linewidth=0.5, zorder=1)

        coords = np.array([projections[nid] for nid in node_ids if nid in projections])

        scatter = ax.scatter(
            coords[:, 0], coords[:, 1],
            c=colors, cmap='viridis' if colors else None,
            s=150, alpha=0.8, edgecolors='white', linewidth=1, zorder=2
        )

        if show_labels:
            for nid in node_ids:
                if nid in projections:
                    x, y = projections[nid]
                    ax.annotate(
                        str(nid), (x, y),
                        fontsize=8, ha='center', va='bottom',
                        xytext=(0, 5), textcoords='offset points'
                    )

        if colors:
            plt.colorbar(scatter, ax=ax, label=color_by)

        ax.set_title(title or f"{self.label} ({self.dr_method.upper()})", fontsize=14)
        ax.set_xlabel("Component 1")
        ax.set_ylabel("Component 2")
        ax.set_xlim(-1.3, 1.3)
        ax.set_ylim(-1.3, 1.3)
        ax.grid(True, alpha=0.3)
        ax.set_aspect('equal')

        plt.tight_layout()
        return fig


class SubstrateList(list):

    def __init__(self, items: List[SubstrateView]):
        super().__init__(items)

    def by_id(self, substrate_id: str) -> Optional[SubstrateView]:
        for s in self:
            if s.id == substrate_id:
                return s
        return None

    def by_label(self, label: str) -> Optional[SubstrateView]:
        for s in self:
            if s.label == label:
                return s
        return None


class NodeSubstratesWidget(anywidget.AnyWidget):

    _esm = pathlib.Path(__file__).parent.parent.parent / "js" / "dist" / "index.js"
    _css = pathlib.Path(__file__).parent.parent.parent / "css" / "widget.css"

    nodes = traitlets.List(trait=traitlets.Dict()).tag(sync=True)
    edges = traitlets.List(trait=traitlets.Dict()).tag(sync=True)
    substrates = traitlets.List(trait=traitlets.Dict()).tag(sync=True)

    dr_method = traitlets.Unicode(default_value="pca").tag(sync=True)
    dr_params = traitlets.Dict(default_value={
        "n_neighbors": 15,
        "min_dist": 0.1,
        "perplexity": 30.0,
        "random_state": 42,
    }).tag(sync=True)

    suggested_regions = traitlets.List(trait=traitlets.Dict()).tag(sync=True)

    width = traitlets.Int(default_value=800).tag(sync=True)
    height = traitlets.Int(default_value=600).tag(sync=True)

    @property
    def viz_width(self) -> int:
        return self.width - DETAIL_PANEL_WIDTH

    layout = traitlets.Unicode(default_value="spring").tag(sync=True)

    selected_nodes = traitlets.List(trait=traitlets.Unicode()).tag(sync=True)

    command = traitlets.Dict(default_value={}).tag(sync=True)

    ready = traitlets.Bool(default_value=True).tag(sync=True)

    rerun_layout = traitlets.Float(default_value=0).tag(sync=True)

    layout_scale = traitlets.Float(default_value=1.0).tag(sync=True)

    def __init__(self, graph=None, width: int = 800, height: int = 600,
                 auto_substrate: bool = False, initial_scale: float = 1.0, **kwargs):
        if graph is not None:
            kwargs['ready'] = False

        kwargs['layout_scale'] = initial_scale

        super().__init__(width=width, height=height, **kwargs)
        self.observe(self._handle_command, names=["command"])
        self.observe(self._handle_layout_change, names=["layout"])
        self.observe(self._handle_rerun_layout, names=["rerun_layout"])
        self._auto_substrate = auto_substrate
        self._initial_scale = initial_scale
        if graph is not None:
            self.load_graph(graph)

    def _handle_command(self, change) -> None:
        cmd = change.get("new", {})
        action = cmd.get("action", "")

        if action == "request_create_substrate":
            node_ids = cmd.get("node_ids", [])
            dr_method = cmd.get("dr_method", self.dr_method)
            click_x = cmd.get("click_x", None)
            click_y = cmd.get("click_y", None)
            if len(node_ids) >= 3:
                self.create_substrate(node_ids, dr_method=dr_method, click_x=click_x, click_y=click_y)

        elif action == "request_update_dr":
            substrate_id = cmd.get("substrate_id")
            dr_method = cmd.get("dr_method")
            if substrate_id and dr_method:
                self.update_dr_method(substrate_id, dr_method)

        elif action == "request_dissolve":
            substrate_id = cmd.get("substrate_id")
            if substrate_id:
                self.dissolve_substrate(substrate_id)

        elif action == "request_rename":
            substrate_id = cmd.get("substrate_id")
            label = cmd.get("label")
            if substrate_id and label:
                self.rename_substrate(substrate_id, label)

        elif action == "request_add_to_substrate":
            substrate_id = cmd.get("substrate_id")
            node_id = cmd.get("node_id")
            if substrate_id and node_id:
                self.add_node_to_substrate(substrate_id, node_id)

        elif action == "request_update_projection_attrs":
            substrate_id = cmd.get("substrate_id")
            attribute_names = cmd.get("attribute_names", [])
            if substrate_id and attribute_names:
                self.update_projection_attributes(substrate_id, attribute_names)

        elif action == "request_resize_substrate":
            substrate_id = cmd.get("substrate_id")
            bounds = cmd.get("bounds")
            if substrate_id and bounds:
                for i, substrate in enumerate(self.substrates):
                    if substrate["id"] == substrate_id:
                        updated = {**substrate, "bounds": bounds}

                        try:
                            self.ready = False
                            node_map = {n["id"]: n for n in self.nodes}
                            selected = [node_map[nid] for nid in substrate["node_ids"] if nid in node_map]
                            attr_keys = substrate.get("projection_attrs")
                            projections = self._compute_dr(selected, substrate.get("dr_method", self.dr_method), attr_keys=attr_keys)
                            updated["projections"] = projections
                            substrates = list(self.substrates)
                            substrates[i] = updated
                            self.substrates = substrates
                            self.command = {"action": "update_substrate", "substrate_id": substrate_id}
                        finally:
                            self.ready = True
                        break

    def _apply_layout(self, layout_type: str, seed: Optional[int] = None, scale: Optional[float] = None) -> None:
        if not self.nodes or not self.edges:
            return
        try:
            effective_scale = max(0.1, min(4.0, scale or 1.0))
            effective_width = int(self.viz_width / effective_scale)
            effective_height = int(self.height / effective_scale)
            graph = widget_to_networkx(self.nodes, self.edges)
            pos = compute_layout(
                graph,
                layout_type=layout_type,
                width=effective_width,
                height=effective_height,
                **({"seed": seed} if seed is not None else {})
            )
            substrate_ids = self.substrate_node_ids
            self.nodes = [
                {**node, "x": pos[node["id"]][0], "y": pos[node["id"]][1]}
                if node["id"] in pos and node["id"] not in substrate_ids
                else dict(node)
                for node in self.nodes
            ]
        except Exception as e:
            print(f"Error computing layout: {e}", file=sys.stderr)

    def _handle_layout_change(self, change) -> None:
        self._apply_layout(change.get("new", "spring"))

    def _handle_rerun_layout(self, change) -> None:
        self._apply_layout(
            self.layout,
            seed=random.randint(1, 100000),
            scale=self.layout_scale
        )

    def load_graph(
        self,
        graph,
        attribute_columns: Optional[List[str]] = None
    ) -> "NodeSubstratesWidget":
        self.ready = False

        try:
            scale = max(0.1, min(4.0, getattr(self, '_initial_scale', 1.0)))
            effective_width = int(self.viz_width / scale)
            effective_height = int(self.height / scale)

            nodes, edges = networkx_to_widget_format(
                graph, attribute_columns, effective_width, effective_height
            )

            if getattr(self, '_auto_substrate', False):
                self.nodes = nodes
                self.edges = edges
                self._compute_suggestions()

                if self.suggested_regions:
                    self.accept_suggestion(0)
            else:
                self.nodes = nodes
                self.edges = edges
                self._compute_suggestions()
        finally:
            self.ready = True

        return self

    def compute_node2vec(
        self,
        dimensions: int = 64,
        walk_length: int = 30,
        num_walks: int = 200,
        workers: int = 4,
        p: float = 1.0,
        q: float = 1.0,
        prefix: str = "n2v_"
    ) -> "NodeSubstratesWidget":
        try:
            from node2vec import Node2Vec
        except ImportError:
            raise ImportError(
                "node2vec is required for this feature. "
                "Install it with: pip install node2vec"
            )

        if not self.nodes or not self.edges:
            raise ValueError("No graph loaded. Call load_graph() first.")

        G = nx.Graph()

        for node in self.nodes:
            G.add_node(node["id"])

        for edge in self.edges:
            src = str(edge["source"])
            tgt = str(edge["target"])
            weight = edge.get("weight", 1.0)
            G.add_edge(src, tgt, weight=weight)

        node2vec = Node2Vec(
            G,
            dimensions=dimensions,
            walk_length=walk_length,
            num_walks=num_walks,
            workers=workers,
            p=p,
            q=q,
            quiet=True
        )

        model = node2vec.fit(window=10, min_count=1, batch_words=4)

        embedding_map = {}
        for node_id in G.nodes():
            if str(node_id) in model.wv:
                embedding_map[str(node_id)] = model.wv[str(node_id)]

        updated_nodes = []
        for node in self.nodes:
            node_copy = dict(node)
            attrs = dict(node_copy.get("attributes", {}))

            if node["id"] in embedding_map:
                embedding = embedding_map[node["id"]]
                for dim in range(dimensions):
                    attrs[f"{prefix}{dim}"] = float(embedding[dim])

            node_copy["attributes"] = attrs
            updated_nodes.append(node_copy)

        self.nodes = updated_nodes
        self._compute_suggestions()

        return self

    def create_substrate(
        self,
        node_ids: List[str],
        dr_method: Optional[DRMethod] = None,
        label: Optional[str] = None,
        click_x: Optional[float] = None,
        click_y: Optional[float] = None,
    ) -> str:
        dr_method = dr_method or self.dr_method

        node_map = {n["id"]: n for n in self.nodes}
        selected = [node_map[nid] for nid in node_ids if nid in node_map]

        if len(selected) < 3:
            raise ValueError("Substrate requires at least 3 nodes")

        node_id_set = set(node_ids)
        updated_substrates = []
        for substrate in self.substrates:
            remaining_ids = [nid for nid in substrate["node_ids"] if nid not in node_id_set]
            if len(remaining_ids) >= 3:
                updated_substrate = dict(substrate)
                updated_substrate["node_ids"] = remaining_ids
                updated_substrate["projections"] = [
                    p for p in substrate["projections"] if p["id"] in remaining_ids
                ]
                updated_substrates.append(updated_substrate)
            elif len(remaining_ids) > 0:
                print(f"Dissolving substrate {substrate['id']} - only {len(remaining_ids)} nodes remaining")

        self.ready = False
        try:
            projections = self._compute_dr(selected, dr_method)

            substrate_id = f"substrate_{len(self.substrates)}"
            substrate = {
                "id": substrate_id,
                "node_ids": node_ids,
                "projections": projections,
                "dr_method": dr_method,
                "label": label or f"Substrate {len(self.substrates) + 1}",
                "bounds": None,
            }

            if click_x is not None and click_y is not None:
                substrate_width = min(250, max(120, int(self.viz_width / max(1, len(self.substrates) + 1))))
                substrate_height = min(200, int(self.height * 0.4))
                substrate_x = int(click_x - substrate_width / 2)
                substrate_y = int(click_y - substrate_height / 2)
                substrate["bounds"] = {
                    "x": substrate_x,
                    "y": substrate_y,
                    "width": substrate_width,
                    "height": substrate_height,
                }

            self.substrates = updated_substrates + [substrate]
            self.command = {"action": "create_substrate", "substrate_id": substrate_id}
            return substrate_id
        finally:
            self.ready = True

    def dissolve_substrate(self, substrate_id: str) -> None:
        self.substrates = [s for s in self.substrates if s["id"] != substrate_id]
        self.command = {"action": "dissolve_substrate", "substrate_id": substrate_id}

    def accept_suggestion(self, suggestion_index: int) -> str:
        if not (0 <= suggestion_index < len(self.suggested_regions)):
            raise IndexError(f"Invalid suggestion index: {suggestion_index}")

        suggestion = self.suggested_regions[suggestion_index]
        return self.create_substrate(
            suggestion["node_ids"],
            dr_method=suggestion.get("recommended_dr", self.dr_method),
            label=suggestion.get("label")
        )

    def update_dr_method(self, substrate_id: str, method: DRMethod) -> None:
        for i, substrate in enumerate(self.substrates):
            if substrate["id"] == substrate_id:
                self.ready = False
                try:
                    node_map = {n["id"]: n for n in self.nodes}
                    selected = [node_map[nid] for nid in substrate["node_ids"]
                               if nid in node_map]

                    attr_keys = substrate.get("projection_attrs")
                    projections = self._compute_dr(selected, method, attr_keys=attr_keys)

                    updated = {**substrate, "projections": projections, "dr_method": method}
                    substrates = list(self.substrates)
                    substrates[i] = updated
                    self.substrates = substrates

                    self.command = {
                        "action": "update_substrate",
                        "substrate_id": substrate_id
                    }
                finally:
                    self.ready = True
                return

        raise ValueError(f"Substrate not found: {substrate_id}")

    def update_projection_attributes(self, substrate_id: str, attribute_names: List[str]) -> None:
        for i, substrate in enumerate(self.substrates):
            if substrate["id"] == substrate_id:
                self.ready = False
                try:
                    node_map = {n["id"]: n for n in self.nodes}
                    selected = [node_map[nid] for nid in substrate["node_ids"]
                               if nid in node_map]
                    projections = self._compute_dr(
                        selected,
                        substrate.get("dr_method", self.dr_method),
                        attr_keys=attribute_names
                    )

                    updated = {
                        **substrate,
                        "projections": projections,
                        "projection_attrs": attribute_names
                    }
                    substrates = list(self.substrates)
                    substrates[i] = updated
                    self.substrates = substrates

                    self.command = {
                        "action": "update_substrate",
                        "substrate_id": substrate_id
                    }
                finally:
                    self.ready = True
                return

        raise ValueError(f"Substrate not found: {substrate_id}")

    def rename_substrate(self, substrate_id: str, label: str) -> None:
        for i, substrate in enumerate(self.substrates):
            if substrate["id"] == substrate_id:
                updated = {**substrate, "label": label}
                substrates = list(self.substrates)
                substrates[i] = updated
                self.substrates = substrates

                self.command = {
                    "action": "update_substrate",
                    "substrate_id": substrate_id
                }
                return

        raise ValueError(f"Substrate not found: {substrate_id}")

    def add_node_to_substrate(self, substrate_id: str, node_id: str) -> None:
        for i, substrate in enumerate(self.substrates):
            if substrate["id"] == substrate_id:
                if node_id in substrate["node_ids"]:
                    return

                self.ready = False
                try:
                    new_node_ids = substrate["node_ids"] + [node_id]
                    node_map = {n["id"]: n for n in self.nodes}
                    selected = [node_map[nid] for nid in new_node_ids if nid in node_map]

                    attr_keys = substrate.get("projection_attrs")
                    projections = self._compute_dr(selected, substrate["dr_method"], attr_keys=attr_keys)

                    updated = {**substrate, "node_ids": new_node_ids, "projections": projections}
                    substrates = list(self.substrates)
                    substrates[i] = updated
                    self.substrates = substrates

                    self.command = {
                        "action": "update_substrate",
                        "substrate_id": substrate_id
                    }
                finally:
                    self.ready = True
                return

        raise ValueError(f"Substrate not found: {substrate_id}")

    def _compute_dr(self, nodes: List[Dict], method: DRMethod, attr_keys: Optional[List[str]] = None) -> List[Dict]:
        def is_numeric_attr(val):
            if isinstance(val, (int, float)):
                return True
            if isinstance(val, (list, tuple)) and len(val) > 0:
                return all(isinstance(v, (int, float)) for v in val)
            return False

        def get_attr_values(node, key):
            val = node.get("attributes", {}).get(key, 0)
            if isinstance(val, (int, float)):
                return [val]
            if isinstance(val, (list, tuple)):
                return [v if isinstance(v, (int, float)) else 0 for v in val]
            return [0]

        if attr_keys is None:
            attr_keys = [
                k for k in nodes[0].get("attributes", {}).keys()
                if is_numeric_attr(nodes[0]["attributes"].get(k))
            ]
        else:
            valid_keys = []
            for k in attr_keys:
                if k in nodes[0].get("attributes", {}):
                    val = nodes[0]["attributes"].get(k)
                    if is_numeric_attr(val):
                        valid_keys.append(k)
            attr_keys = valid_keys

        if not attr_keys:
            raise ValueError("No numeric attributes found for DR projection")

        rows = []
        for n in nodes:
            row = []
            for k in attr_keys:
                row.extend(get_attr_values(n, k))
            rows.append(row)
        X = np.array(rows)

        X = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-8)

        coords = compute_projection(X, method, self.dr_params)

        coords_min = coords.min(axis=0)
        coords_max = coords.max(axis=0)
        coords_range = coords_max - coords_min
        coords_range[coords_range == 0] = 1
        coords = 2 * (coords - coords_min) / coords_range - 1

        return [
            {"id": nodes[i]["id"], "x": float(coords[i, 0]), "y": float(coords[i, 1])}
            for i in range(len(nodes))
        ]

    def _compute_suggestions(self) -> None:
        if not self.nodes or not self.edges:
            self.suggested_regions = []
            return

        self.suggested_regions = detect_substrate_candidates(
            self.nodes, self.edges
        )

    def refresh_suggestions(self) -> None:
        self._compute_suggestions()

    @property
    def substrate_node_ids(self) -> set:
        return set(
            nid
            for substrate in self.substrates
            for nid in substrate["node_ids"]
        )

    @property
    def topological_node_ids(self) -> set:
        all_ids = {n["id"] for n in self.nodes}
        return all_ids - self.substrate_node_ids

    def substrate(self, index_or_id) -> SubstrateView:
        if isinstance(index_or_id, int):
            if not (0 <= index_or_id < len(self.substrates)):
                raise IndexError(f"Substrate index out of range: {index_or_id}")
            return SubstrateView(self.substrates[index_or_id], self)
        else:
            for s in self.substrates:
                if s["id"] == index_or_id:
                    return SubstrateView(s, self)
            raise ValueError(f"Substrate not found: {index_or_id}")

    @property
    def substrate_views(self) -> SubstrateList:
        return SubstrateList([SubstrateView(s, self) for s in self.substrates])

    def plot_dr(
        self,
        method: str = "pca",
        node_ids: Optional[List[str]] = None,
        figsize=(8, 8),
        show_labels: bool = True,
        show_edges: bool = True,
        color_by: Optional[str] = None,
        title: Optional[str] = None,
    ) -> "plt.Figure":
        from .debug import plot_single_dr

        G = nx.Graph()
        for node in self.nodes:
            G.add_node(node["id"], **node.get("attributes", {}))
        for edge in self.edges:
            G.add_edge(edge["source"], edge["target"])

        return plot_single_dr(
            G,
            method=method,
            node_ids=node_ids,
            figsize=figsize,
            dr_params=self.dr_params,
            show_labels=show_labels,
            show_edges=show_edges,
            color_by=color_by,
            title=title,
        )

    def plot_dr_comparison(
        self,
        node_ids: Optional[List[str]] = None,
        methods: Optional[List[str]] = None,
        figsize=(15, 5),
        show_labels: bool = True,
        color_by: Optional[str] = None,
    ) -> "plt.Figure":
        from .debug import plot_dr_comparison

        G = nx.Graph()
        for node in self.nodes:
            G.add_node(node["id"], **node.get("attributes", {}))
        for edge in self.edges:
            G.add_edge(edge["source"], edge["target"])

        return plot_dr_comparison(
            G,
            node_ids=node_ids,
            methods=methods,
            figsize=figsize,
            dr_params=self.dr_params,
            show_labels=show_labels,
            color_by=color_by,
        )

    def expand_selection(self, hops: int = 1, include_original: bool = True) -> List[str]:
        if not self.selected_nodes:
            return []

        G = nx.Graph()
        for node in self.nodes:
            G.add_node(str(node["id"]))
        for edge in self.edges:
            src = str(edge["source"])
            tgt = str(edge["target"])
            G.add_edge(src, tgt)

        max_hops = max(0, int(hops))
        result_set = set()

        for sid in map(str, self.selected_nodes):
            if sid not in G:
                continue
            lengths = nx.single_source_shortest_path_length(G, sid, cutoff=max_hops)
            for nid, dist in lengths.items():
                if dist == 0 and not include_original:
                    continue
                result_set.add(str(nid))

        return sorted(result_set)

    def create_substrate_from_selection_with_hops(
        self,
        hops: int = 1,
        dr_method: Optional[DRMethod] = None,
        label: Optional[str] = None,
        click_x: Optional[float] = None,
        click_y: Optional[float] = None,
    ) -> Optional[str]:
        node_ids = self.expand_selection(hops=hops, include_original=True)
        if len(node_ids) < 3:
            return None
        return self.create_substrate(node_ids, dr_method=dr_method, label=label, click_x=click_x, click_y=click_y)
