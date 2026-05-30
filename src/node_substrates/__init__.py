from .widget import NodeSubstratesWidget
from .types import (
    NodeData,
    EdgeData,
    SubstrateConfig,
    SubstrateSuggestion,
    DRMethod,
    DRParams,
)
from .datasets import (
    load_coauthorship_sample,
    load_sample_network,
    load_cora_network,
)
from .debug import (
    plot_dr_comparison,
    plot_single_dr,
    get_dr_coords,
    inspect_attributes,
)

__version__ = "0.1.0"
__all__ = [
    "NodeSubstratesWidget",
    "NodeData",
    "EdgeData",
    "SubstrateConfig",
    "SubstrateSuggestion",
    "DRMethod",
    "DRParams",
    "load_coauthorship_sample",
    "load_sample_network",
    "load_cora_network",
    "plot_dr_comparison",
    "plot_single_dr",
    "get_dr_coords",
    "inspect_attributes",
]
