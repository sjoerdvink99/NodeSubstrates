import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
import networkx as nx


VISPUBDATA_CSV_URL = "https://docs.google.com/spreadsheets/d/1xgoOPu28dQSSGPIp_HHQs0uvvcyLNdkMF9XtRajhhxU/gviz/tq?tqx=out:csv&gid=0"

CACHE_DIR = Path(__file__).parent / "cache"

LOCAL_DATA_DIR = Path(__file__).parent.parent.parent.parent / "data"


def download_vispubdata(force: bool = False) -> Path:
    local_file = LOCAL_DATA_DIR / "vispubdata.csv"
    if local_file.exists() and not force:
        return local_file

    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / "vispubdata.csv"

    if cache_file.exists() and not force:
        return cache_file

    print("Downloading vispubdata.org dataset...")
    urllib.request.urlretrieve(VISPUBDATA_CSV_URL, cache_file)
    print(f"Downloaded to {cache_file}")

    return cache_file


def load_vispubdata(force_download: bool = False) -> List[Dict]:
    import csv

    csv_path = download_vispubdata(force=force_download)

    papers = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            authors_str = row.get("AuthorNames-Deduped", row.get("AuthorNames", ""))
            authors = [a.strip() for a in authors_str.split(";") if a.strip()]

            keywords_str = row.get("AuthorKeywords", "")
            keywords = [k.strip().lower() for k in keywords_str.split(";") if k.strip()]

            if authors:
                papers.append({
                    "title": row.get("Title", ""),
                    "authors": authors,
                    "year": int(row.get("Year", 0)) if row.get("Year", "").isdigit() else 0,
                    "conference": row.get("Conference", ""),
                    "keywords": keywords,
                    "doi": row.get("DOI", ""),
                })

    return papers


def build_coauthorship_network(
    papers: List[Dict],
    min_papers: int = 3,
    year_range: Optional[Tuple[int, int]] = None,
    max_authors: Optional[int] = None,
) -> nx.Graph:
    if year_range:
        papers = [p for p in papers if year_range[0] <= p["year"] <= year_range[1]]

    author_papers: Dict[str, List[Dict]] = defaultdict(list)
    for paper in papers:
        for author in paper["authors"]:
            author_papers[author].append(paper)

    active_authors = {
        author for author, plist in author_papers.items()
        if len(plist) >= min_papers
    }

    if max_authors and len(active_authors) > max_authors:
        sorted_authors = sorted(
            active_authors,
            key=lambda a: len(author_papers[a]),
            reverse=True
        )
        active_authors = set(sorted_authors[:max_authors])

    coauthorship_count: Dict[Tuple[str, str], int] = defaultdict(int)
    for paper in papers:
        paper_authors = [a for a in paper["authors"] if a in active_authors]

        for i, a1 in enumerate(paper_authors):
            for a2 in paper_authors[i + 1:]:
                edge = tuple(sorted([a1, a2]))
                coauthorship_count[edge] += 1

    G = nx.Graph()

    for author in active_authors:
        plist = author_papers[author]

        keyword_counts: Dict[str, int] = defaultdict(int)
        for paper in plist:
            for kw in paper["keywords"]:
                keyword_counts[kw] += 1

        top_keywords = sorted(keyword_counts.items(), key=lambda x: -x[1])[:5]
        topic_vector = {kw: count for kw, count in top_keywords}

        years = [p["year"] for p in plist if p["year"] > 0]
        first_year = min(years) if years else 0
        last_year = max(years) if years else 0

        G.add_node(
            author,
            label=author,
            pub_count=len(plist),
            first_year=first_year,
            last_year=last_year,
            career_length=last_year - first_year + 1 if first_year > 0 else 0,
            keywords=topic_vector,
            **{f"topic_{i}": count for i, (kw, count) in enumerate(top_keywords)}
        )

    for (a1, a2), weight in coauthorship_count.items():
        if a1 in active_authors and a2 in active_authors:
            G.add_edge(a1, a2, weight=weight)

    return G


def compute_author_metrics(G: nx.Graph) -> None:
    degrees = dict(G.degree())
    clustering = nx.clustering(G)
    betweenness = nx.betweenness_centrality(G)

    for node in G.nodes():
        G.nodes[node]["degree"] = degrees[node]
        G.nodes[node]["clustering"] = clustering[node]
        G.nodes[node]["betweenness"] = betweenness[node]

        pub_count = G.nodes[node].get("pub_count", 0)
        G.nodes[node]["h_index_approx"] = min(pub_count, degrees[node])


def load_coauthorship_sample(
    n_authors: int = 150,
    min_papers: int = 5,
    year_range: Tuple[int, int] = (2010, 2024),
    force_download: bool = False,
) -> nx.Graph:
    papers = load_vispubdata(force_download=force_download)
    G = build_coauthorship_network(
        papers,
        min_papers=min_papers,
        year_range=year_range,
        max_authors=n_authors,
    )
    compute_author_metrics(G)

    print(f"Loaded co-authorship network: {G.number_of_nodes()} authors, {G.number_of_edges()} collaborations")

    return G


def load_sample_network() -> nx.Graph:
    import random
    random.seed(42)

    G = nx.Graph()

    communities = [
        ("perception", ["Alice", "Bob", "Carol", "David", "Eve", "Frank", "Grace", "Henry", "Iris", "Jack",
                        "Kate", "Leo", "Mia", "Noah", "Olivia"]),
        ("systems", ["Peter", "Quinn", "Rachel", "Sam", "Tina", "Uma", "Victor", "Wendy", "Xavier", "Yara",
                     "Zack", "Amy", "Ben", "Chris", "Diana"]),
        ("theory", ["Edward", "Fiona", "George", "Hannah", "Ian", "Julia", "Kevin", "Laura", "Mike", "Nina",
                    "Oscar", "Paula", "Quincy", "Rosa", "Steve"]),
    ]

    for topic, authors in communities:
        for i, author in enumerate(authors):
            G.add_node(
                author,
                label=author,
                pub_count=random.randint(5, 50),
                h_index_approx=random.randint(3, 25),
                topic_perception=1.0 if topic == "perception" else random.uniform(0, 0.3),
                topic_systems=1.0 if topic == "systems" else random.uniform(0, 0.3),
                topic_theory=1.0 if topic == "theory" else random.uniform(0, 0.3),
                career_length=random.randint(3, 20),
            )

    for topic, authors in communities:
        for i, a1 in enumerate(authors):
            for a2 in authors[i + 1:]:
                if random.random() < 0.4:
                    G.add_edge(a1, a2, weight=random.randint(1, 5))

    all_authors = [a for _, authors in communities for a in authors]
    for _ in range(30):
        a1 = random.choice(all_authors)
        a2 = random.choice(all_authors)
        if a1 != a2 and not G.has_edge(a1, a2):
            G.add_edge(a1, a2, weight=1)

    compute_author_metrics(G)

    return G
