import json
from pathlib import Path
import networkx as nx


LOCAL_DATA_DIR = Path(__file__).parent.parent.parent.parent / "data"


def load_zinc_molecules(compute_metrics: bool = True) -> nx.Graph:
    json_path = LOCAL_DATA_DIR / "zinc_graph.json"

    if not json_path.exists():
        raise FileNotFoundError(
            f"ZINC graph data not found at {json_path}. "
            "Please ensure the data file is in the data/ directory."
        )

    with open(json_path, "r", encoding="utf-8") as f:
        content = f.read()
        content = content.replace("\n", " ").replace("\r", " ").replace("\t", " ")
        data = json.loads(content)

    G = nx.node_link_graph(data)
    G = G.to_undirected()

    for node_id in G.nodes():
        node = G.nodes[node_id]

        if node.get("name"):
            node["label"] = node["name"]
        elif node.get("smiles"):
            node["label"] = node["smiles"]
        elif node.get("label"):
            node["label"] = str(node.get("label"))
        else:
            node["label"] = str(node_id)

        for k, v in list(node.items()):
            if k == "id":
                continue
            if k == "smiles":
                continue
            if k == "embedding":
                if isinstance(v, str):
                    try:
                        parsed = json.loads(v)
                        v = parsed
                    except Exception:
                        pass
                if isinstance(v, (list, tuple)):
                    try:
                        node["embedding"] = [float(x) for x in v]
                    except Exception:
                        node["embedding"] = list(v)
                continue

            if isinstance(v, str) and v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    node[k] = parsed
                    v = parsed
                except Exception:
                    pass

            if isinstance(v, str):
                s = v.strip()
                if s == "":
                    continue

                try:
                    if s.isdigit():
                        node[k] = int(s)
                    else:
                        node[k] = float(s)
                except Exception:
                    node[k] = v

        feats = node.get("features")
        if isinstance(feats, dict):
            for fk, fv in feats.items():
                if fk in node:
                    node_key = f"feat_{fk}"
                else:
                    node_key = fk
                node[node_key] = fv

            node.pop("features", None)

    if compute_metrics:
        compute_network_metrics(G)

    print(f"Loaded ZINC molecule graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

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
    return load_zinc_molecules()


def load_coauthorship_sample(
    n_papers: int = 500,
    min_citations: int = 3,
    compute_metrics: bool = True,
) -> nx.Graph:
    G = load_zinc_molecules(compute_metrics=False)

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
