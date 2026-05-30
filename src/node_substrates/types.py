from dataclasses import dataclass, field
from typing import Dict, List, Optional, Literal, Any


DRMethod = Literal["pca", "umap", "tsne"]


@dataclass
class NodeData:
    id: str
    label: str
    attributes: Dict[str, Any] = field(default_factory=dict)
    x: Optional[float] = None
    y: Optional[float] = None

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "label": self.label,
            "attributes": self.attributes,
            "x": self.x,
            "y": self.y,
        }


@dataclass
class EdgeData:
    source: str
    target: str
    weight: float = 1.0

    def to_dict(self) -> Dict:
        return {
            "source": self.source,
            "target": self.target,
            "weight": self.weight,
        }


@dataclass
class Projection:
    id: str
    x: float
    y: float

    def to_dict(self) -> Dict:
        return {"id": self.id, "x": self.x, "y": self.y}


@dataclass
class SubstrateBounds:
    x: float
    y: float
    width: float
    height: float

    def to_dict(self) -> Dict:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
        }


@dataclass
class SubstrateConfig:
    id: str
    node_ids: List[str]
    projections: List[Projection]
    dr_method: DRMethod
    label: str
    bounds: Optional[SubstrateBounds] = None

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "node_ids": self.node_ids,
            "projections": [p.to_dict() for p in self.projections],
            "dr_method": self.dr_method,
            "label": self.label,
            "bounds": self.bounds.to_dict() if self.bounds else None,
        }


@dataclass
class SubstrateSuggestion:
    node_ids: List[str]
    score: float
    label: str
    reason: str
    recommended_dr: DRMethod = "pca"

    def to_dict(self) -> Dict:
        return {
            "node_ids": self.node_ids,
            "score": self.score,
            "label": self.label,
            "reason": self.reason,
            "recommended_dr": self.recommended_dr,
        }


@dataclass
class DRParams:
    svd_solver: str = "auto"
    n_neighbors: int = 15
    min_dist: float = 0.1
    perplexity: float = 30.0
    random_state: int = 42

    def to_dict(self) -> Dict:
        return {
            "svd_solver": self.svd_solver,
            "n_neighbors": self.n_neighbors,
            "min_dist": self.min_dist,
            "perplexity": self.perplexity,
            "random_state": self.random_state,
        }
