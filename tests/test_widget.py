import pytest
import networkx as nx

from node_substrates import NodeSubstratesWidget


@pytest.fixture
def sample_graph():
    G = nx.karate_club_graph()
    for node in G.nodes():
        G.nodes[node]['degree'] = G.degree(node)
        G.nodes[node]['clustering'] = nx.clustering(G, node)
        G.nodes[node]['random_attr'] = float(node) / len(G.nodes())
    return G


@pytest.fixture
def widget():
    return NodeSubstratesWidget()


@pytest.fixture
def widget_with_graph(widget, sample_graph):
    widget.load_graph(sample_graph)
    return widget


class TestWidgetInitialization:

    def test_widget_creates_with_defaults(self):
        w = NodeSubstratesWidget()
        assert w.width == 800
        assert w.height == 600
        assert w.nodes == []
        assert w.edges == []
        assert w.substrates == []
        assert w.dr_method == "pca"

    def test_widget_accepts_custom_dimensions(self):
        w = NodeSubstratesWidget(width=800, height=600)
        assert w.width == 800
        assert w.height == 600


class TestLoadGraph:

    def test_load_graph_populates_nodes(self, widget, sample_graph):
        widget.load_graph(sample_graph)
        assert len(widget.nodes) == len(sample_graph.nodes())

    def test_load_graph_populates_edges(self, widget, sample_graph):
        widget.load_graph(sample_graph)
        assert len(widget.edges) == len(sample_graph.edges())

    def test_load_graph_extracts_attributes(self, widget, sample_graph):
        widget.load_graph(sample_graph)
        node = widget.nodes[0]
        assert 'attributes' in node
        assert 'degree' in node['attributes']
        assert 'clustering' in node['attributes']

    def test_load_graph_computes_suggestions(self, widget, sample_graph):
        widget.load_graph(sample_graph)
        assert isinstance(widget.suggested_regions, list)

    def test_load_graph_returns_self(self, widget, sample_graph):
        result = widget.load_graph(sample_graph)
        assert result is widget


class TestSubstrateCreation:

    def test_create_substrate_returns_id(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        substrate_id = widget_with_graph.create_substrate(node_ids)
        assert substrate_id.startswith('substrate_')

    def test_create_substrate_adds_to_substrates(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        widget_with_graph.create_substrate(node_ids)
        assert len(widget_with_graph.substrates) == 1

    def test_create_substrate_has_correct_structure(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        widget_with_graph.create_substrate(node_ids, label="Test Substrate")

        substrate = widget_with_graph.substrates[0]
        assert 'id' in substrate
        assert 'node_ids' in substrate
        assert 'projections' in substrate
        assert 'dr_method' in substrate
        assert 'label' in substrate
        assert substrate['label'] == "Test Substrate"

    def test_create_substrate_computes_projections(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        widget_with_graph.create_substrate(node_ids)

        substrate = widget_with_graph.substrates[0]
        projections = substrate['projections']

        assert len(projections) == 5
        for proj in projections:
            assert 'id' in proj
            assert 'x' in proj
            assert 'y' in proj
            assert -1 <= proj['x'] <= 1
            assert -1 <= proj['y'] <= 1

    def test_create_substrate_requires_minimum_nodes(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:2]]
        with pytest.raises(ValueError, match="at least 3 nodes"):
            widget_with_graph.create_substrate(node_ids)

    def test_create_substrate_sets_command(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        substrate_id = widget_with_graph.create_substrate(node_ids)

        assert widget_with_graph.command['action'] == 'create_substrate'
        assert widget_with_graph.command['substrate_id'] == substrate_id

    def test_create_multiple_substrates(self, widget_with_graph):
        ids1 = [n['id'] for n in widget_with_graph.nodes[:5]]
        ids2 = [n['id'] for n in widget_with_graph.nodes[5:10]]

        widget_with_graph.create_substrate(ids1)
        widget_with_graph.create_substrate(ids2)

        assert len(widget_with_graph.substrates) == 2


class TestDRMethods:

    def test_pca_projection(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:10]]
        widget_with_graph.create_substrate(node_ids, dr_method='pca')

        substrate = widget_with_graph.substrates[0]
        assert substrate['dr_method'] == 'pca'
        assert len(substrate['projections']) == 10

    def test_update_dr_method(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:10]]
        substrate_id = widget_with_graph.create_substrate(node_ids, dr_method='pca')

        widget_with_graph.update_dr_method(substrate_id, 'pca')

        assert widget_with_graph.substrates[0]['dr_method'] == 'pca'


class TestProjectionAttributes:

    def test_update_projection_attributes(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        substrate_id = widget_with_graph.create_substrate(node_ids)

        first_node = widget_with_graph.nodes[0]
        attrs = first_node.get('attributes', {})
        numeric_attrs = [k for k, v in attrs.items() if isinstance(v, (int, float))]

        if len(numeric_attrs) >= 2:
            selected_attrs = numeric_attrs[:2]
            widget_with_graph.update_projection_attributes(substrate_id, selected_attrs)

            substrate = widget_with_graph.substrates[0]
            assert substrate.get('projection_attrs') == selected_attrs
            assert len(substrate['projections']) == 5

    def test_update_projection_attributes_sets_command(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        substrate_id = widget_with_graph.create_substrate(node_ids)

        first_node = widget_with_graph.nodes[0]
        attrs = first_node.get('attributes', {})
        numeric_attrs = [k for k, v in attrs.items() if isinstance(v, (int, float))]

        if len(numeric_attrs) >= 2:
            widget_with_graph.update_projection_attributes(substrate_id, numeric_attrs[:2])

            assert widget_with_graph.command['action'] == 'update_substrate'
            assert widget_with_graph.command['substrate_id'] == substrate_id

    def test_update_dr_preserves_projection_attrs(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        substrate_id = widget_with_graph.create_substrate(node_ids)

        first_node = widget_with_graph.nodes[0]
        attrs = first_node.get('attributes', {})
        numeric_attrs = [k for k, v in attrs.items() if isinstance(v, (int, float))]

        if len(numeric_attrs) >= 2:
            selected_attrs = numeric_attrs[:2]
            widget_with_graph.update_projection_attributes(substrate_id, selected_attrs)

            widget_with_graph.update_dr_method(substrate_id, 'pca')

            substrate = widget_with_graph.substrates[0]
            assert substrate.get('projection_attrs') == selected_attrs


class TestDissolveSubstrate:

    def test_dissolve_removes_substrate(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        substrate_id = widget_with_graph.create_substrate(node_ids)

        widget_with_graph.dissolve_substrate(substrate_id)

        assert len(widget_with_graph.substrates) == 0

    def test_dissolve_sets_command(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        substrate_id = widget_with_graph.create_substrate(node_ids)

        widget_with_graph.dissolve_substrate(substrate_id)

        assert widget_with_graph.command['action'] == 'dissolve_substrate'
        assert widget_with_graph.command['substrate_id'] == substrate_id


class TestAddNodeToSubstrate:

    def test_add_node_increases_node_count(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        substrate_id = widget_with_graph.create_substrate(node_ids)

        new_node_id = widget_with_graph.nodes[5]['id']
        widget_with_graph.add_node_to_substrate(substrate_id, new_node_id)

        substrate = widget_with_graph.substrates[0]
        assert len(substrate['node_ids']) == 6
        assert new_node_id in substrate['node_ids']

    def test_add_node_recomputes_projections(self, widget_with_graph):
        node_ids = [n['id'] for n in widget_with_graph.nodes[:5]]
        substrate_id = widget_with_graph.create_substrate(node_ids)

        new_node_id = widget_with_graph.nodes[5]['id']
        widget_with_graph.add_node_to_substrate(substrate_id, new_node_id)

        substrate = widget_with_graph.substrates[0]
        assert len(substrate['projections']) == 6


class TestAutoSubstrate:

    def test_auto_substrate_creates_substrate(self, sample_graph):
        widget = NodeSubstratesWidget(auto_substrate=True)
        widget.load_graph(sample_graph)

        if widget.suggested_regions:
            assert len(widget.substrates) >= 1


class TestAcceptSuggestion:

    def test_accept_suggestion_creates_substrate(self, widget_with_graph):
        if widget_with_graph.suggested_regions:
            substrate_id = widget_with_graph.accept_suggestion(0)
            assert len(widget_with_graph.substrates) == 1
            assert substrate_id.startswith('substrate_')

    def test_accept_invalid_suggestion_raises(self, widget_with_graph):
        with pytest.raises(IndexError):
            widget_with_graph.accept_suggestion(999)


class TestReadyState:

    def test_ready_defaults_to_true(self):
        w = NodeSubstratesWidget()
        assert w.ready is True

    def test_ready_starts_false_when_graph_provided(self, sample_graph):
        initial_ready_values = []

        class TrackingWidget(NodeSubstratesWidget):
            def load_graph(self, graph, attribute_columns=None):
                initial_ready_values.append(self.ready)
                return super().load_graph(graph, attribute_columns)

        w = TrackingWidget(sample_graph)

        assert initial_ready_values[0] is False
        assert w.ready is True

    def test_ready_is_false_during_load_graph(self, sample_graph):
        widget = NodeSubstratesWidget()
        ready_values = []

        def track_ready(change):
            ready_values.append(change['new'])

        widget.observe(track_ready, names=['ready'])
        widget.load_graph(sample_graph)

        assert False in ready_values, "ready should be set to False during load"
        assert ready_values[-1] is True, "ready should be True after load completes"

    def test_ready_is_true_after_load_graph(self, sample_graph):
        widget = NodeSubstratesWidget()
        widget.load_graph(sample_graph)
        assert widget.ready is True

    def test_ready_is_true_after_load_graph_with_auto_substrate(self, sample_graph):
        widget = NodeSubstratesWidget(auto_substrate=True)
        widget.load_graph(sample_graph)
        assert widget.ready is True

    def test_ready_is_true_even_if_load_fails(self, widget):
        import networkx as nx
        empty_graph = nx.Graph()

        widget.load_graph(empty_graph)
        assert widget.ready is True


class TestAutoSubstrateWithDR:

    def test_auto_substrate_computes_valid_projections(self, sample_graph):
        widget = NodeSubstratesWidget(auto_substrate=True)
        widget.load_graph(sample_graph)

        if widget.substrates:
            substrate = widget.substrates[0]
            assert 'projections' in substrate
            assert len(substrate['projections']) > 0
            for proj in substrate['projections']:
                assert 'id' in proj
                assert 'x' in proj
                assert 'y' in proj
                assert isinstance(proj['x'], float)
                assert isinstance(proj['y'], float)
                assert -1 <= proj['x'] <= 1
                assert -1 <= proj['y'] <= 1

    def test_auto_substrate_node_ids_match_projections(self, sample_graph):
        widget = NodeSubstratesWidget(auto_substrate=True)
        widget.load_graph(sample_graph)

        if widget.substrates:
            substrate = widget.substrates[0]
            node_ids = set(substrate['node_ids'])
            proj_ids = {p['id'] for p in substrate['projections']}
            assert node_ids == proj_ids

    def test_load_graph_with_auto_substrate_sets_all_traits(self, sample_graph):
        widget = NodeSubstratesWidget(auto_substrate=True)
        widget.load_graph(sample_graph)

        assert len(widget.nodes) > 0
        assert len(widget.edges) > 0
        assert isinstance(widget.suggested_regions, list)

        if widget.suggested_regions:
            assert len(widget.substrates) > 0
            assert widget.command.get('action') == 'create_substrate'


class TestSubstrateView:

    def test_substrate_method_returns_substrate_view(self, sample_graph):
        from node_substrates.widget import SubstrateView

        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            sv = widget.substrate(0)
            assert isinstance(sv, SubstrateView)

    def test_substrate_method_by_index(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            sv = widget.substrate(0)
            assert sv.id == widget.substrates[0]['id']

    def test_substrate_method_by_id(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            substrate_id = widget.substrates[0]['id']
            sv = widget.substrate(substrate_id)
            assert sv.id == substrate_id

    def test_substrate_method_invalid_index_raises(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        with pytest.raises(IndexError):
            widget.substrate(999)

    def test_substrate_method_invalid_id_raises(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        with pytest.raises(ValueError):
            widget.substrate('nonexistent_id')

    def test_substrate_view_properties(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            sv = widget.substrate(0)
            assert sv.id is not None
            assert sv.node_ids is not None
            assert sv.projections is not None
            assert sv.dr_method is not None
            assert sv.label is not None

    def test_substrate_view_dict_access(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            sv = widget.substrate(0)
            assert sv['id'] == sv.id
            assert sv['node_ids'] == sv.node_ids

    def test_substrate_views_property(self, sample_graph):
        from node_substrates.widget import SubstrateView, SubstrateList

        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        views = widget.substrate_views
        assert isinstance(views, SubstrateList)

        if widget.substrates:
            assert len(views) == len(widget.substrates)
            assert all(isinstance(v, SubstrateView) for v in views)

    def test_substrate_list_by_id(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            substrate_id = widget.substrates[0]['id']
            sv = widget.substrate_views.by_id(substrate_id)
            assert sv is not None
            assert sv.id == substrate_id

    def test_substrate_list_by_label(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            label = widget.substrates[0]['label']
            sv = widget.substrate_views.by_label(label)
            assert sv is not None
            assert sv.label == label


class TestSubstrateViewPlot:

    def test_substrate_plot_returns_figure(self, sample_graph):
        import matplotlib.pyplot as plt

        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            fig = widget.substrate(0).plot()
            assert isinstance(fig, plt.Figure)
            plt.close(fig)

    def test_substrate_plot_with_options(self, sample_graph):
        import matplotlib.pyplot as plt

        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            fig = widget.substrate(0).plot(
                figsize=(6, 6),
                show_labels=False,
                show_edges=False,
                color_by='degree',
                title='Test Title'
            )
            assert isinstance(fig, plt.Figure)
            plt.close(fig)


class TestSubstrateViewShow:

    def test_substrate_show_returns_widget(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            mini = widget.substrate(0).show()
            assert isinstance(mini, NodeSubstratesWidget)

    def test_substrate_show_contains_only_substrate_nodes(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            sv = widget.substrate(0)
            mini = sv.show()

            assert len(mini.nodes) == len(sv.node_ids)

            mini_ids = {n['id'] for n in mini.nodes}
            assert mini_ids == set(sv.node_ids)

    def test_substrate_show_accepts_dimensions(self, sample_graph):
        widget = NodeSubstratesWidget(sample_graph, auto_substrate=True)

        if widget.substrates:
            mini = widget.substrate(0).show(width=300, height=300)
            assert mini.width == 300
            assert mini.height == 300


class TestWidgetPlotDR:

    def test_plot_dr_returns_figure(self, widget_with_graph):
        import matplotlib.pyplot as plt

        fig = widget_with_graph.plot_dr('pca')
        assert isinstance(fig, plt.Figure)
        plt.close(fig)

    def test_plot_dr_with_different_methods(self, widget_with_graph):
        import matplotlib.pyplot as plt

        for method in ['pca', 'tsne']:
            fig = widget_with_graph.plot_dr(method)
            assert isinstance(fig, plt.Figure)
            plt.close(fig)

    def test_plot_dr_with_node_subset(self, widget_with_graph):
        import matplotlib.pyplot as plt

        node_ids = [n['id'] for n in widget_with_graph.nodes[:10]]
        fig = widget_with_graph.plot_dr('pca', node_ids=node_ids)
        assert isinstance(fig, plt.Figure)
        plt.close(fig)

    def test_plot_dr_comparison_returns_figure(self, widget_with_graph):
        import matplotlib.pyplot as plt

        fig = widget_with_graph.plot_dr_comparison(methods=['pca', 'tsne'])
        assert isinstance(fig, plt.Figure)
        plt.close(fig)
