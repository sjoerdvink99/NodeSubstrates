import numpy as np
from typing import Dict, Literal

DRMethodType = Literal["pca", "umap", "tsne"]


def compute_projection(
    X: np.ndarray,
    method: DRMethodType,
    params: Dict
) -> np.ndarray:
    if method == "pca":
        return _compute_pca(X, params)
    elif method == "umap":
        return _compute_umap(X, params)
    elif method == "tsne":
        return _compute_tsne(X, params)
    else:
        raise ValueError(f"Unknown DR method: {method}")


def _compute_pca(X: np.ndarray, params: Dict) -> np.ndarray:
    from sklearn.decomposition import PCA

    pca = PCA(
        n_components=2,
        svd_solver=params.get("svd_solver", "auto"),
        random_state=params.get("random_state", 42)
    )
    return pca.fit_transform(X)


def _compute_umap(X: np.ndarray, params: Dict) -> np.ndarray:
    try:
        import umap
    except ImportError:
        raise ImportError(
            "umap-learn is required for UMAP projection. "
            "Install with: pip install umap-learn"
        )

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=params.get("n_neighbors", 15),
        min_dist=params.get("min_dist", 0.1),
        random_state=params.get("random_state", 42)
    )
    return reducer.fit_transform(X)


def _compute_tsne(X: np.ndarray, params: Dict) -> np.ndarray:
    from sklearn.manifold import TSNE

    n_samples = X.shape[0]
    perplexity = min(params.get("perplexity", 30.0), (n_samples - 1) / 3)

    tsne = TSNE(
        n_components=2,
        perplexity=perplexity,
        random_state=params.get("random_state", 42),
        init="pca"
    )
    return tsne.fit_transform(X)


__all__ = ["compute_projection", "DRMethodType"]
