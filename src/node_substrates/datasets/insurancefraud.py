import json
from pathlib import Path
from typing import Optional, List
import networkx as nx


LOCAL_DATA_DIR = Path(__file__).parent.parent.parent.parent / "data"


def load_insurance_fraud_network(
    compute_metrics: bool = True,
) -> nx.Graph:
    json_path = LOCAL_DATA_DIR / "insurance-fraud-data.json"

    if not json_path.exists():
        raise FileNotFoundError(
            f"Insurance fraud data not found at {json_path}. "
            "Please ensure the data file is in the data/ directory."
        )

    with open(json_path, "r", encoding="utf-8") as f:
        content = f.read()
        content = content.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
        data = json.loads(content)

    G = nx.node_link_graph(data, edges="links")

    G = G.to_undirected()

    for node_id in G.nodes():
        node = G.nodes[node_id]
        node_type = node.get("type", "Unknown")
        info = node.get("info", "")

        if isinstance(info, dict):
            name = info.get("name", str(node_id))
            role = info.get("role", node_type)
            node["label"] = name
            node["role"] = role

            for key, value in info.items():
                if key not in node:
                    node[key] = value

            del node["info"]
        else:
            node["label"] = str(info) if info else f"{node_type} {node_id}"

            if "info" in node:
                del node["info"]

        if "enter" in node and isinstance(node["enter"], list):
            if node["enter"]:
                node["enter"] = ", ".join(node["enter"])
            else:
                del node["enter"]
        if "exit" in node and isinstance(node["exit"], list):
            if node["exit"]:
                node["exit"] = ", ".join(node["exit"])
            else:
                del node["exit"]

    if compute_metrics:
        compute_network_metrics(G)

    print(f"Loaded insurance fraud network: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

    type_counts = {}
    for node_id in G.nodes():
        node_type = G.nodes[node_id].get("type", "Unknown")
        type_counts[node_type] = type_counts.get(node_type, 0) + 1
    print(f"Node types: {type_counts}")

    return G


def compute_network_metrics(G: nx.Graph) -> None:
    degrees = dict(G.degree())
    clustering = nx.clustering(G)

    if G.number_of_nodes() <= 2000:
        betweenness = nx.betweenness_centrality(G)
    else:
        betweenness = nx.betweenness_centrality(G, k=min(100, G.number_of_nodes()))

    for node in G.nodes():
        G.nodes[node]["degree"] = degrees[node]
        G.nodes[node]["clustering"] = round(clustering[node], 4)
        G.nodes[node]["betweenness"] = round(betweenness[node], 6)


def get_fraud_subgraph(
    G: nx.Graph,
    node_types: Optional[List[str]] = None,
    min_degree: int = 0,
) -> nx.Graph:
    nodes_to_keep = []

    for node_id in G.nodes():
        node = G.nodes[node_id]
        node_type = node.get("type", "Unknown")
        degree = G.degree(node_id)

        if node_types is not None and node_type not in node_types:
            continue

        if degree < min_degree:
            continue

        nodes_to_keep.append(node_id)

    return G.subgraph(nodes_to_keep).copy()


def load_sample_network() -> nx.Graph:
    return load_insurance_fraud_network()
