"""Tests for node_substrates.debug module."""

import pytest
import networkx as nx
import matplotlib.pyplot as plt

from node_substrates.debug import (
    plot_dr_comparison,
    plot_single_dr,
    get_dr_coords,
    inspect_attributes,
)


@pytest.fixture
def sample_graph():
    """Create a sample graph with numeric attributes for testing."""
    G = nx.karate_club_graph()
    for node in G.nodes():
        G.nodes[node]['degree'] = G.degree(node)
        G.nodes[node]['clustering'] = nx.clustering(G, node)
        G.nodes[node]['random_attr'] = float(node) / len(G.nodes())
    return G


class TestPlotDRComparison:
    """Tests for plot_dr_comparison function."""

    def test_returns_figure(self, sample_graph):
        """plot_dr_comparison returns a matplotlib Figure."""
        fig = plot_dr_comparison(sample_graph, methods=['pca'])
        assert isinstance(fig, plt.Figure)
        plt.close(fig)

    def test_default_methods(self, sample_graph):
        """plot_dr_comparison uses pca, umap, tsne by default."""
        # Just test with pca to keep fast
        fig = plot_dr_comparison(sample_graph, methods=['pca', 'tsne'])
        assert isinstance(fig, plt.Figure)
        plt.close(fig)

    def test_with_node_subset(self, sample_graph):
        """plot_dr_comparison works with node subset."""
        node_ids = list(sample_graph.nodes())[:10]
        fig = plot_dr_comparison(sample_graph, node_ids=node_ids, methods=['pca'])
        assert isinstance(fig, plt.Figure)
        plt.close(fig)

    def test_with_color_by(self, sample_graph):
        """plot_dr_comparison accepts color_by parameter."""
        fig = plot_dr_comparison(sample_graph, color_by='degree', methods=['pca'])
        assert isinstance(fig, plt.Figure)
        plt.close(fig)

    def test_with_custom_figsize(self, sample_graph):
        """plot_dr_comparison accepts custom figsize."""
        fig = plot_dr_comparison(sample_graph, figsize=(10, 4), methods=['pca'])
        assert isinstance(fig, plt.Figure)
        plt.close(fig)


class TestPlotSingleDR:
    """Tests for plot_single_dr function."""

    def test_returns_figure(self, sample_graph):
        """plot_single_dr returns a matplotlib Figure."""
        fig = plot_single_dr(sample_graph, method='pca')
        assert isinstance(fig, plt.Figure)
        plt.close(fig)

    def test_with_different_methods(self, sample_graph):
        """plot_single_dr works with different DR methods."""
        for method in ['pca', 'tsne']:  # Skip umap to keep test fast
            fig = plot_single_dr(sample_graph, method=method)
            assert isinstance(fig, plt.Figure)
            plt.close(fig)

    def test_with_edges(self, sample_graph):
        """plot_single_dr can show edges."""
        fig = plot_single_dr(sample_graph, method='pca', show_edges=True)
        assert isinstance(fig, plt.Figure)
        plt.close(fig)

    def test_without_edges(self, sample_graph):
        """plot_single_dr can hide edges."""
        fig = plot_single_dr(sample_graph, method='pca', show_edges=False)
        assert isinstance(fig, plt.Figure)
        plt.close(fig)

    def test_with_node_subset(self, sample_graph):
        """plot_single_dr works with node subset."""
        node_ids = list(sample_graph.nodes())[:10]
        fig = plot_single_dr(sample_graph, method='pca', node_ids=node_ids)
        assert isinstance(fig, plt.Figure)
        plt.close(fig)

    def test_with_custom_title(self, sample_graph):
        """plot_single_dr accepts custom title."""
        fig = plot_single_dr(sample_graph, method='pca', title='Custom Title')
        assert isinstance(fig, plt.Figure)
        plt.close(fig)


class TestGetDRCoords:
    """Tests for get_dr_coords function."""

    def test_returns_dict(self, sample_graph):
        """get_dr_coords returns a dictionary."""
        coords = get_dr_coords(sample_graph, method='pca')
        assert isinstance(coords, dict)

    def test_coords_for_all_nodes(self, sample_graph):
        """get_dr_coords returns coords for all nodes."""
        coords = get_dr_coords(sample_graph, method='pca')
        assert len(coords) == len(sample_graph.nodes())

    def test_coords_are_tuples(self, sample_graph):
        """get_dr_coords returns (x, y) tuples."""
        coords = get_dr_coords(sample_graph, method='pca')
        for node_id, coord in coords.items():
            assert isinstance(coord, tuple)
            assert len(coord) == 2
            assert isinstance(coord[0], float)
            assert isinstance(coord[1], float)

    def test_normalized_coords(self, sample_graph):
        """get_dr_coords normalizes coordinates to [-1, 1] by default."""
        coords = get_dr_coords(sample_graph, method='pca', normalize=True)
        for node_id, (x, y) in coords.items():
            assert -1.1 <= x <= 1.1  # Allow small tolerance
            assert -1.1 <= y <= 1.1

    def test_unnormalized_coords(self, sample_graph):
        """get_dr_coords can return unnormalized coordinates."""
        coords = get_dr_coords(sample_graph, method='pca', normalize=False)
        # Just check it returns something
        assert len(coords) > 0

    def test_with_node_subset(self, sample_graph):
        """get_dr_coords works with node subset."""
        node_ids = list(sample_graph.nodes())[:10]
        coords = get_dr_coords(sample_graph, method='pca', node_ids=node_ids)
        assert len(coords) == 10


class TestInspectAttributes:
    """Tests for inspect_attributes function."""

    def test_runs_without_error(self, sample_graph, capsys):
        """inspect_attributes runs without error."""
        inspect_attributes(sample_graph)
        captured = capsys.readouterr()
        assert 'Graph:' in captured.out
        assert 'Attributes:' in captured.out

    def test_shows_numeric_stats(self, sample_graph, capsys):
        """inspect_attributes shows stats for numeric attributes."""
        inspect_attributes(sample_graph)
        captured = capsys.readouterr()
        assert 'min:' in captured.out
        assert 'max:' in captured.out
        assert 'mean:' in captured.out

    def test_with_node_subset(self, sample_graph, capsys):
        """inspect_attributes works with node subset."""
        node_ids = list(sample_graph.nodes())[:10]
        inspect_attributes(sample_graph, node_ids=node_ids)
        captured = capsys.readouterr()
        assert '10 nodes' in captured.out
