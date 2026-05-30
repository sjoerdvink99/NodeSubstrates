#!/usr/bin/env python3
"""Pre-compute Node2Vec embeddings for the insurance fraud dataset.

This script loads the insurance fraud graph, computes Node2Vec embeddings,
and saves them back to the JSON file as node attributes (n2v_0, n2v_1, etc.).

Usage:
    uv run python scripts/precompute_node2vec.py
"""

import json
from pathlib import Path

import networkx as nx
from node2vec import Node2Vec


def load_graph_from_json(json_path: Path) -> tuple[nx.Graph, dict]:
    """Load graph from JSON file and return both graph and raw data."""
    with open(json_path, "r") as f:
        data = json.load(f)
    
    # Use link="links" since the JSON format uses "links" key for edges
    G = nx.node_link_graph(data, edges="links")
    return G, data


def compute_node2vec_embeddings(
    G: nx.Graph,
    dimensions: int = 32,
    walk_length: int = 30,
    num_walks: int = 100,
    workers: int = 4,
    p: float = 1.0,
    q: float = 1.0,
) -> dict[int, list[float]]:
    """Compute Node2Vec embeddings for all nodes.
    
    Args:
        G: NetworkX graph
        dimensions: Embedding dimensions
        walk_length: Length of random walks
        num_walks: Number of walks per node
        workers: Number of parallel workers
        p: Return parameter
        q: In-out parameter
        
    Returns:
        Dictionary mapping node IDs to embedding vectors
    """
    print(f"Computing Node2Vec embeddings for {G.number_of_nodes()} nodes...")
    print(f"  dimensions={dimensions}, walk_length={walk_length}, num_walks={num_walks}")
    print(f"  p={p}, q={q}, workers={workers}")
    
    # Create Node2Vec model
    node2vec = Node2Vec(
        G,
        dimensions=dimensions,
        walk_length=walk_length,
        num_walks=num_walks,
        workers=workers,
        p=p,
        q=q,
        quiet=False,
    )
    
    # Train the model
    print("Training Node2Vec model...")
    model = node2vec.fit(window=10, min_count=1, batch_words=4)
    
    # Extract embeddings for each node
    embeddings = {}
    for node in G.nodes():
        node_str = str(node)
        if node_str in model.wv:
            embeddings[node] = model.wv[node_str].tolist()
    
    print(f"Computed embeddings for {len(embeddings)} nodes")
    return embeddings


def update_json_with_embeddings(
    json_path: Path,
    embeddings: dict[int, list[float]],
) -> None:
    """Update JSON file with Node2Vec embeddings as node attributes.
    
    Args:
        json_path: Path to the JSON file
        embeddings: Dictionary mapping node IDs to embedding vectors
    """
    with open(json_path, "r") as f:
        data = json.load(f)
    
    # Get dimensions from first embedding
    if embeddings:
        first_embedding = next(iter(embeddings.values()))
        dimensions = len(first_embedding)
        print(f"Adding {dimensions}-dimensional embedding array to each node")
    else:
        print("No embeddings to add")
        return
    
    # Update each node with embedding array
    for node_data in data["nodes"]:
        node_id = node_data["id"]
        
        # Remove old n2v_* attributes if present
        keys_to_remove = [k for k in node_data.keys() if k.startswith("n2v_")]
        for key in keys_to_remove:
            del node_data[key]
        
        # Add new embedding array
        if node_id in embeddings:
            node_data["embedding"] = embeddings[node_id]
    
    # Write updated data back to file
    with open(json_path, "w") as f:
        json.dump(data, f, indent=2)
    
    print(f"Updated {json_path}")


def main():
    """Main entry point."""
    # Paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    json_path = project_root / "data" / "insurance-fraud-data.json"
    
    print(f"Loading graph from {json_path}")
    G, data = load_graph_from_json(json_path)
    print(f"Loaded graph with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges")
    
    # Compute Node2Vec embeddings
    embeddings = compute_node2vec_embeddings(
        G,
        dimensions=32,
        walk_length=30,
        num_walks=100,
        workers=4,  # Use multiple workers for offline computation
        p=1.0,
        q=1.0,
    )
    
    # Update JSON with embeddings
    update_json_with_embeddings(json_path, embeddings)
    
    print("\nDone! Node2Vec embeddings have been pre-computed and saved.")
    print("You can now load the graph in notebooks without computing embeddings.")


if __name__ == "__main__":
    main()
