import numpy as np
from typing import List, Dict, Tuple
import networkx as nx
from sklearn.preprocessing import StandardScaler


def detect_substrate_candidates(
    nodes: List[Dict],
    edges: List[Dict],
    max_suggestions: int = 3,
    min_community_size: int = 6
) -> List[Dict]:
    if not nodes or not edges:
        return []

    G = nx.Graph()
    for node in nodes:
        G.add_node(node["id"], **node.get("attributes", {}))
    for edge in edges:
        G.add_edge(edge["source"], edge["target"])

    node_map = {n["id"]: n for n in nodes}
    attr_keys = _get_numeric_attr_keys(nodes)

    if not attr_keys:
        return []

    X_all = np.array([
        [node_map[nid]["attributes"].get(k, 0) for k in attr_keys]
        for nid in G.nodes()
    ])
    node_id_list = list(G.nodes())
    node_idx_map = {nid: i for i, nid in enumerate(node_id_list)}

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_all)

    try:
        communities = list(nx.community.louvain_communities(G, seed=42))
    except Exception:
        communities = [set(c) for c in nx.connected_components(G)]

    candidates = []

    for i, community in enumerate(communities):
        if len(community) < min_community_size:
            continue

        community_indices = [node_idx_map[nid] for nid in community if nid in node_idx_map]
        if len(community_indices) < min_community_size:
            continue

        X_community = X_scaled[community_indices]

        score, criteria = _compute_substrate_score(
            community, community_indices, X_community, X_scaled, G, node_id_list
        )

        if score > 0.15:
            candidates.append({
                "node_ids": list(community),
                "score": float(score),
                "label": f"Community {i + 1}",
                "reason": _generate_reason(criteria, len(community)),
                "recommended_dr": _recommend_dr(len(community), len(attr_keys), criteria)
            })

    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[:max_suggestions]


def _get_numeric_attr_keys(nodes: List[Dict]) -> List[str]:
    if not nodes:
        return []
    return [
        k for k in nodes[0].get("attributes", {}).keys()
        if isinstance(nodes[0]["attributes"].get(k), (int, float))
    ]


def _compute_substrate_score(
    community: set,
    community_indices: List[int],
    X_community: np.ndarray,
    X_all: np.ndarray,
    G: nx.Graph,
    node_id_list: List[str]
) -> Tuple[float, Dict[str, float]]:
    n_nodes = len(community_indices)
    n_dims = X_community.shape[1]

    criteria = {}

    if n_nodes > 1:
        var_per_dim = np.var(X_community, axis=0)
        criteria["variance"] = float(np.mean(var_per_dim))
    else:
        criteria["variance"] = 0.0

    criteria["dimensionality"] = min(n_dims / 6.0, 1.0)

    outlier_scores = []
    for nid in community:
        neighbors = set(G.neighbors(nid)) & community
        if neighbors:
            node_idx = [i for i, n in enumerate(node_id_list) if n == nid][0]
            neighbor_indices = [
                i for i, n in enumerate(node_id_list) if n in neighbors
            ]
            node_attrs = X_all[node_idx]
            neighbor_attrs = X_all[neighbor_indices]

            neighbor_mean = np.mean(neighbor_attrs, axis=0)
            dist = np.linalg.norm(node_attrs - neighbor_mean)
            outlier_scores.append(dist)

    if outlier_scores:
        criteria["outlier_presence"] = float(np.std(outlier_scores))
    else:
        criteria["outlier_presence"] = 0.0

    mismatch_scores = []
    sample_size = min(50, n_nodes * (n_nodes - 1) // 2)
    pairs_checked = 0

    for i, nid1 in enumerate(community):
        if pairs_checked >= sample_size:
            break
        for nid2 in list(community)[i+1:]:
            if pairs_checked >= sample_size:
                break
            idx1 = [j for j, n in enumerate(node_id_list) if n == nid1][0]
            idx2 = [j for j, n in enumerate(node_id_list) if n == nid2][0]

            attr_dist = np.linalg.norm(X_all[idx1] - X_all[idx2])
            try:
                topo_dist = nx.shortest_path_length(G, nid1, nid2)
            except nx.NetworkXNoPath:
                topo_dist = float('inf')

            if attr_dist < 1.0 and topo_dist > 2:
                mismatch_scores.append(topo_dist / (attr_dist + 0.1))
            pairs_checked += 1

    if mismatch_scores:
        criteria["attr_topo_mismatch"] = min(float(np.mean(mismatch_scores)) / 10, 1.0)
    else:
        criteria["attr_topo_mismatch"] = 0.0

    node_ids = set(community)
    internal_edges = sum(1 for u, v in G.edges() if u in node_ids and v in node_ids)
    max_edges = n_nodes * (n_nodes - 1) / 2
    criteria["density"] = internal_edges / max_edges if max_edges > 0 else 0

    score = (
        0.30 * min(criteria["variance"], 1.0) +
        0.15 * criteria["dimensionality"] +
        0.20 * min(criteria["outlier_presence"], 1.0) +
        0.25 * criteria["attr_topo_mismatch"] +
        0.10 * criteria["density"]
    )

    return score, criteria


def _recommend_dr(n_nodes: int, n_dims: int, criteria: Dict[str, float]) -> str:
    if n_nodes < 15:
        return "pca"

    if criteria.get("outlier_presence", 0) > 0.8:
        return "umap"

    if n_dims > 5 and criteria.get("variance", 0) > 0.5:
        return "umap" if n_nodes > 50 else "tsne"

    if criteria.get("density", 0) > 0.3 and criteria.get("attr_topo_mismatch", 0) > 0.3:
        return "tsne"

    return "pca"


def _generate_reason(criteria: Dict[str, float], node_count: int) -> str:
    reasons = []

    if criteria.get("variance", 0) > 0.7:
        reasons.append("high attribute diversity")
    elif criteria.get("variance", 0) > 0.4:
        reasons.append("moderate attribute diversity")

    if criteria.get("attr_topo_mismatch", 0) > 0.3:
        reasons.append("similar nodes scattered in topology")

    if criteria.get("outlier_presence", 0) > 0.5:
        reasons.append("potential outliers among neighbors")

    if criteria.get("density", 0) > 0.4:
        reasons.append("dense edge structure")

    if not reasons:
        reasons.append("potential for DR organization")

    return f"{node_count} nodes with {', '.join(reasons)}"


__all__ = ["detect_substrate_candidates"]
