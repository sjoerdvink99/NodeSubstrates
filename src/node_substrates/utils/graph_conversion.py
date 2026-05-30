import hashlib
import json
import pathlib
import time
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx

_DATA_DIR = pathlib.Path(__file__).parents[3] / "data"


def compute_layout(
    graph: nx.Graph,
    layout_type: str = "spring",
    width: int = 1200,
    height: int = 800,
    verbose: bool = False,
    **layout_kwargs
) -> Dict[Any, Tuple[float, float]]:
    if graph.number_of_nodes() == 0:
        return {}

    graph_name: Optional[str] = None
    if isinstance(graph.graph, dict) and graph.graph.get("name"):
        graph_name = str(graph.graph.get("name"))
    elif getattr(graph, "name", None):
        graph_name = str(getattr(graph, "name"))
    else:
        h = hashlib.sha1()
        try:
            nodes_repr = ",".join(map(str, sorted(graph.nodes())))
            edges_repr = ",".join(f"{u}-{v}" for u, v in sorted(graph.edges()))
            h.update(nodes_repr.encode("utf-8"))
            h.update(edges_repr.encode("utf-8"))
            graph_name = f"graph_{h.hexdigest()[:8]}"
        except Exception:
            graph_name = "graph"

    safe_name = "".join(c if (c.isalnum() or c in ("_", "-")) else "_" for c in (graph_name or "graph"))

    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = _DATA_DIR / f"layout_{layout_type}_{safe_name}.json"

    try:
        if cache_path.exists():
            if verbose:
                print(f"Loading cached layout from {cache_path}")
            with cache_path.open("r", encoding="utf-8") as fh:
                loaded = json.load(fh)

            loaded_keys = set(loaded.keys())
            current_keys = set(str(n) for n in graph.nodes())
            if loaded_keys == current_keys:
                scaled_pos = {}
                for node in graph.nodes():
                    key = str(node)
                    xy = loaded.get(key)
                    if xy is not None:
                        scaled_pos[node] = (float(xy[0]), float(xy[1]))
                return scaled_pos
            elif verbose:
                print("Cached layout does not match current graph nodes; recomputing layout")
    except Exception as e:
        if verbose:
            print(f"Could not load cached layout ({e}); computing fresh layout")

    pos = {}
    start_time = time.time()

    try:
        if layout_type == "spring":
            pos = nx.spring_layout(
                graph,
                k=layout_kwargs.get("k", None),
                iterations=layout_kwargs.get("iterations", 15000),
                seed=layout_kwargs.get("seed", 42),
                scale=1.0
            )
        elif layout_type == "kamada_kawai":
            pos = nx.kamada_kawai_layout(graph)
        elif layout_type == "circular":
            pos = nx.circular_layout(graph)
        elif layout_type == "shell":
            pos = nx.shell_layout(graph)
        elif layout_type == "spectral":
            pos = nx.spectral_layout(graph)
        elif layout_type == "planar":
            if nx.check_planarity(graph)[0]:
                pos = nx.planar_layout(graph)
            else:
                print("Graph is not planar, falling back to spring layout")
                pos = nx.spring_layout(graph, k=1.5, iterations=1500, seed=layout_kwargs.get("seed", 42))
        elif layout_type == "bipartite":
            seed = layout_kwargs.get("seed", 42)
            if nx.is_bipartite(graph):
                try:
                    top_nodes = {n for n, d in graph.nodes(data=True) if d.get("bipartite", 0) == 0}
                    if not top_nodes:
                        top_nodes, _ = nx.bipartite.sets(graph)
                    pos = nx.bipartite_layout(graph, top_nodes)
                except Exception:
                    pos = nx.spring_layout(graph, k=1.5, iterations=1500, seed=seed)
            else:
                print("Graph is not bipartite, falling back to spring layout")
                pos = nx.spring_layout(graph, k=1.5, iterations=1500, seed=seed)
        elif layout_type == "multipartite":
            seed = layout_kwargs.get("seed", 42)
            has_subset = all("subset" in graph.nodes[n] for n in graph.nodes())
            if has_subset:
                pos = nx.multipartite_layout(graph)
            else:
                try:
                    communities = list(nx.community.louvain_communities(graph, seed=seed))
                    for i, comm in enumerate(communities):
                        for node in comm:
                            graph.nodes[node]["subset"] = i
                    pos = nx.multipartite_layout(graph)
                except Exception:
                    print("Could not create multipartite layout, falling back to spring")
                    pos = nx.spring_layout(graph, k=1.5, iterations=1500, seed=seed)
        elif layout_type == "bfs":
            seed = layout_kwargs.get("seed", 42)
            if graph.number_of_nodes() > 0:
                root = max(graph.nodes(), key=lambda n: graph.degree(n))
                bfs_tree = nx.bfs_tree(graph, root)
                pos = nx.spring_layout(bfs_tree, k=2.0, iterations=1500, seed=seed)
                for node in graph.nodes():
                    if node not in pos:
                        pos[node] = (0.0, 0.0)
        else:
            pos = nx.spring_layout(graph, k=1.5, iterations=1500, seed=layout_kwargs.get("seed", 42))
    except Exception as e:
        print(f"Layout '{layout_type}' failed: {e}, falling back to spring layout")
        pos = nx.spring_layout(graph, k=1.5, iterations=1500, seed=layout_kwargs.get("seed", 42))

    elapsed = time.time() - start_time
    if verbose:
        print(f"Layout '{layout_type}' computed in {elapsed:.2f}s for {graph.number_of_nodes()} nodes")

    if not pos:
        return {}

    xs = [p[0] for p in pos.values()]
    ys = [p[1] for p in pos.values()]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    x_range = max_x - min_x if max_x > min_x else 1.0
    y_range = max_y - min_y if max_y > min_y else 1.0

    margin = 0.075
    usable_width = 1.0 - 2 * margin
    usable_height = 1.0 - 2 * margin

    scaled_pos = {}
    for node_id, (px, py) in pos.items():
        norm_x = (px - min_x) / x_range
        norm_y = (py - min_y) / y_range
        x = norm_x * (width * usable_width) + (width * margin)
        y = norm_y * (height * usable_height) + (height * margin)
        scaled_pos[node_id] = (x, y)

    try:
        serializable = {str(n): [float(v[0]), float(v[1])] for n, v in scaled_pos.items()}
        with cache_path.open("w", encoding="utf-8") as fh:
            json.dump(serializable, fh, indent=2)
        if verbose:
            print(f"Saved computed layout to {cache_path}")
    except Exception:
        if verbose:
            print("Warning: failed to save layout cache")

    return scaled_pos


def networkx_to_widget_format(
    graph: nx.Graph,
    attribute_columns: Optional[List[str]] = None,
    width: int = 1200,
    height: int = 800,
    layout_type: str = "spring"
) -> Tuple[List[Dict], List[Dict]]:
    nodes = []
    edges = []

    pos = compute_layout(graph, layout_type=layout_type, width=width, height=height)

    for node_id in graph.nodes():
        node_data = graph.nodes[node_id]
        label = str(node_data.get("label", node_data.get("name", node_id)))

        if attribute_columns:
            attributes = {
                k: node_data.get(k, 0)
                for k in attribute_columns
                if k in node_data
            }
        else:
            attributes = {
                k: v
                for k, v in node_data.items()
                if k not in ("x", "y", "pos", "label", "name")
            }

        node_pos = pos.get(node_id, (width / 2, height / 2))
        x, y = node_pos

        nodes.append({
            "id": str(node_id),
            "label": label,
            "attributes": attributes,
            "x": x,
            "y": y,
        })

    for source, target, edge_data in graph.edges(data=True):
        edges.append({
            "source": str(source),
            "target": str(target),
            "weight": edge_data.get("weight", 1.0),
        })

    return nodes, edges


def widget_to_networkx(
    nodes: List[Dict],
    edges: List[Dict]
) -> nx.Graph:
    G = nx.Graph()

    for node in nodes:
        node_attrs = {
            "label": node.get("label", node["id"]),
            **node.get("attributes", {})
        }
        G.add_node(node["id"], **node_attrs)

    for edge in edges:
        G.add_edge(
            edge["source"],
            edge["target"],
            weight=edge.get("weight", 1.0)
        )

    return G
