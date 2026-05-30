from typing import List, Optional, Dict, Any, Tuple
import numpy as np
import matplotlib.pyplot as plt


def plot_dr_comparison(
    graph,
    node_ids: Optional[List[str]] = None,
    attribute_columns: Optional[List[str]] = None,
    methods: Optional[List[str]] = None,
    figsize: Tuple[int, int] = (15, 5),
    dr_params: Optional[Dict[str, Any]] = None,
    show_labels: bool = True,
    color_by: Optional[str] = None,
) -> plt.Figure:
    from .dr import compute_projection

    methods = methods or ["pca", "umap", "tsne"]
    dr_params = dr_params or {
        "n_neighbors": 15,
        "min_dist": 0.1,
        "perplexity": 30.0,
        "random_state": 42,
    }

    if node_ids is None:
        node_ids = list(graph.nodes())

    nodes_data = []
    for nid in node_ids:
        attrs = dict(graph.nodes[nid])
        nodes_data.append({"id": str(nid), "attributes": attrs})

    if attribute_columns is None:
        attribute_columns = [
            k for k, v in nodes_data[0]["attributes"].items()
            if isinstance(v, (int, float))
        ]

    if not attribute_columns:
        raise ValueError("No numeric attributes found for DR projection")

    X = np.array([
        [n["attributes"].get(k, 0) for k in attribute_columns]
        for n in nodes_data
    ])

    X_std = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-8)

    colors = None
    if color_by and color_by in nodes_data[0]["attributes"]:
        colors = [n["attributes"].get(color_by, 0) for n in nodes_data]

    n_methods = len(methods)
    fig, axes = plt.subplots(1, n_methods, figsize=figsize)
    if n_methods == 1:
        axes = [axes]

    for ax, method in zip(axes, methods):
        try:
            coords = compute_projection(X_std, method, dr_params)

            coords_min = coords.min(axis=0)
            coords_max = coords.max(axis=0)
            coords_range = coords_max - coords_min
            coords_range[coords_range == 0] = 1
            coords_norm = 2 * (coords - coords_min) / coords_range - 1

            scatter = ax.scatter(
                coords_norm[:, 0], coords_norm[:, 1],
                c=colors, cmap='viridis' if colors else None,
                s=100, alpha=0.7, edgecolors='white', linewidth=0.5
            )

            if show_labels:
                for i, nid in enumerate(node_ids):
                    ax.annotate(
                        str(nid), (coords_norm[i, 0], coords_norm[i, 1]),
                        fontsize=8, ha='center', va='bottom',
                        xytext=(0, 5), textcoords='offset points'
                    )

            ax.set_title(f"{method.upper()}", fontsize=14)
            ax.set_xlabel("Component 1")
            ax.set_ylabel("Component 2")
            ax.set_xlim(-1.2, 1.2)
            ax.set_ylim(-1.2, 1.2)
            ax.grid(True, alpha=0.3)
            ax.set_aspect('equal')

            if colors and method == methods[-1]:
                plt.colorbar(scatter, ax=ax, label=color_by)

        except Exception as e:
            ax.text(0.5, 0.5, f"Error: {e}", ha='center', va='center', transform=ax.transAxes)
            ax.set_title(f"{method.upper()} (failed)")

    plt.suptitle(f"DR Comparison ({len(node_ids)} nodes, {len(attribute_columns)} attributes)", fontsize=12)
    plt.tight_layout()
    return fig


def plot_single_dr(
    graph,
    method: str = "pca",
    node_ids: Optional[List[str]] = None,
    attribute_columns: Optional[List[str]] = None,
    figsize: Tuple[int, int] = (8, 8),
    dr_params: Optional[Dict[str, Any]] = None,
    show_labels: bool = True,
    show_edges: bool = True,
    color_by: Optional[str] = None,
    title: Optional[str] = None,
) -> plt.Figure:
    from .dr import compute_projection

    dr_params = dr_params or {
        "n_neighbors": 15,
        "min_dist": 0.1,
        "perplexity": 30.0,
        "random_state": 42,
    }

    if node_ids is None:
        node_ids = list(graph.nodes())

    nodes_data = []
    for nid in node_ids:
        attrs = dict(graph.nodes[nid])
        nodes_data.append({"id": str(nid), "attributes": attrs})

    if attribute_columns is None:
        attribute_columns = [
            k for k, v in nodes_data[0]["attributes"].items()
            if isinstance(v, (int, float))
        ]

    if not attribute_columns:
        raise ValueError("No numeric attributes found for DR projection")

    X = np.array([
        [n["attributes"].get(k, 0) for k in attribute_columns]
        for n in nodes_data
    ])

    X_std = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-8)

    coords = compute_projection(X_std, method, dr_params)

    coords_min = coords.min(axis=0)
    coords_max = coords.max(axis=0)
    coords_range = coords_max - coords_min
    coords_range[coords_range == 0] = 1
    coords_norm = 2 * (coords - coords_min) / coords_range - 1

    pos_map = {str(node_ids[i]): coords_norm[i] for i in range(len(node_ids))}

    colors = None
    if color_by and color_by in nodes_data[0]["attributes"]:
        colors = [n["attributes"].get(color_by, 0) for n in nodes_data]

    fig, ax = plt.subplots(figsize=figsize)

    if show_edges:
        for u, v in graph.edges():
            if str(u) in pos_map and str(v) in pos_map:
                p1 = pos_map[str(u)]
                p2 = pos_map[str(v)]
                ax.plot([p1[0], p2[0]], [p1[1], p2[1]],
                       'gray', alpha=0.3, linewidth=0.5, zorder=1)

    scatter = ax.scatter(
        coords_norm[:, 0], coords_norm[:, 1],
        c=colors, cmap='viridis' if colors else None,
        s=150, alpha=0.8, edgecolors='white', linewidth=1, zorder=2
    )

    if show_labels:
        for i, nid in enumerate(node_ids):
            ax.annotate(
                str(nid), (coords_norm[i, 0], coords_norm[i, 1]),
                fontsize=8, ha='center', va='bottom',
                xytext=(0, 5), textcoords='offset points'
            )

    if colors:
        plt.colorbar(scatter, ax=ax, label=color_by)

    ax.set_title(title or f"{method.upper()} Projection ({len(node_ids)} nodes)", fontsize=14)
    ax.set_xlabel("Component 1")
    ax.set_ylabel("Component 2")
    ax.set_xlim(-1.3, 1.3)
    ax.set_ylim(-1.3, 1.3)
    ax.grid(True, alpha=0.3)
    ax.set_aspect('equal')

    plt.tight_layout()
    return fig


def get_dr_coords(
    graph,
    method: str = "pca",
    node_ids: Optional[List[str]] = None,
    attribute_columns: Optional[List[str]] = None,
    dr_params: Optional[Dict[str, Any]] = None,
    normalize: bool = True,
) -> Dict[str, Tuple[float, float]]:
    from .dr import compute_projection

    dr_params = dr_params or {
        "n_neighbors": 15,
        "min_dist": 0.1,
        "perplexity": 30.0,
        "random_state": 42,
    }

    if node_ids is None:
        node_ids = list(graph.nodes())

    nodes_data = []
    for nid in node_ids:
        attrs = dict(graph.nodes[nid])
        nodes_data.append({"id": str(nid), "attributes": attrs})

    if attribute_columns is None:
        attribute_columns = [
            k for k, v in nodes_data[0]["attributes"].items()
            if isinstance(v, (int, float))
        ]

    if not attribute_columns:
        raise ValueError("No numeric attributes found for DR projection")

    X = np.array([
        [n["attributes"].get(k, 0) for k in attribute_columns]
        for n in nodes_data
    ])

    X_std = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-8)

    coords = compute_projection(X_std, method, dr_params)

    if normalize:
        coords_min = coords.min(axis=0)
        coords_max = coords.max(axis=0)
        coords_range = coords_max - coords_min
        coords_range[coords_range == 0] = 1
        coords = 2 * (coords - coords_min) / coords_range - 1

    return {str(node_ids[i]): (float(coords[i, 0]), float(coords[i, 1]))
            for i in range(len(node_ids))}


def inspect_attributes(graph, node_ids: Optional[List[str]] = None) -> None:
    if node_ids is None:
        node_ids = list(graph.nodes())

    print(f"Graph: {len(node_ids)} nodes\n")

    all_attrs = {}
    for nid in node_ids:
        for k, v in graph.nodes[nid].items():
            if k not in all_attrs:
                all_attrs[k] = {"type": type(v).__name__, "values": []}
            all_attrs[k]["values"].append(v)

    print("Attributes:")
    print("-" * 50)
    for attr, info in all_attrs.items():
        values = info["values"]
        if isinstance(values[0], (int, float)):
            print(f"  {attr}: {info['type']}")
            print(f"    - min: {min(values):.4f}")
            print(f"    - max: {max(values):.4f}")
            print(f"    - mean: {np.mean(values):.4f}")
            print(f"    - std: {np.std(values):.4f}")
        else:
            unique = set(str(v) for v in values[:100])
            print(f"  {attr}: {info['type']}")
            print(f"    - unique values: {len(unique)}")
            if len(unique) <= 5:
                print(f"    - values: {unique}")
        print()


__all__ = [
    "plot_dr_comparison",
    "plot_single_dr",
    "get_dr_coords",
    "inspect_attributes",
]
