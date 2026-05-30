import json
from pathlib import Path
import networkx as nx


LOCAL_DATA_DIR = Path(__file__).parent.parent.parent.parent / "data"


def load_cora_network(compute_metrics: bool = True) -> nx.Graph:
    json_path = LOCAL_DATA_DIR / "cora_graph.json"

    if not json_path.exists():
        raise FileNotFoundError(
            f"CORA network data not found at {json_path}. "
            "Please ensure the data file is in the data/ directory."
        )

    with open(json_path, "r", encoding="utf-8") as f:
        content = f.read()
        content = content.replace("\n", " ").replace("\r", " ").replace("\t", " ")
        data = json.loads(content)

    try:
        G = nx.node_link_graph(data)
    except TypeError:
        G = nx.node_link_graph(data)

    G = G.to_undirected()

    for node_id in G.nodes():
        node = G.nodes[node_id]

        if node.get("title"):
            node["label"] = node["title"]
        elif node.get("label"):
            node["label"] = str(node.get("label"))
        else:
            node["label"] = str(node_id)

        subject = node.get("subject") or node.get("category") or node.get("topic") or node.get("class")
        if subject:
            node["subject"] = subject

    if compute_metrics:
        compute_network_metrics(G)

    print(f"Loaded CORA network: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

    subject_counts = {}
    for node_id in G.nodes():
        subj = G.nodes[node_id].get("subject", "Unknown")
        subject_counts[subj] = subject_counts.get(subj, 0) + 1
    print(f"Subjects: {subject_counts}")

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
        G.nodes[node]["betweenness"] = round(betweenness.get(node, 0.0), 6)


def load_sample_network() -> nx.Graph:
    return load_cora_network()


def load_coauthorship_sample(
    n_papers: int = 500,
    min_citations: int = 3,
    compute_metrics: bool = True,
) -> nx.Graph:
    G = load_cora_network(compute_metrics=False)

    selected_nodes = set()

    seeds = [n for n, d in G.degree() if d >= min_citations]
    seeds.sort(key=lambda n: -G.degree(n))

    for s in seeds:
        if len(selected_nodes) >= n_papers:
            break
        if s in selected_nodes:
            continue
        selected_nodes.add(s)
        for nb in G.neighbors(s):
            if len(selected_nodes) >= n_papers:
                break
            selected_nodes.add(nb)

    if len(selected_nodes) < n_papers:
        remaining = [n for n in G.nodes() if n not in selected_nodes]
        remaining.sort(key=lambda n: -G.degree(n))
        for n in remaining:
            if len(selected_nodes) >= n_papers:
                break
            selected_nodes.add(n)

    if not selected_nodes:
        return G.subgraph([]).copy()

    subG = G.subgraph(selected_nodes).copy()

    if compute_metrics:
        compute_network_metrics(subG)

    print(f"Created sample subgraph: {subG.number_of_nodes()} nodes, {subG.number_of_edges()} edges")

    return subG
