import json
import pathlib
import pytest
import networkx as nx
import threading
import http.server
import socketserver

from playwright.sync_api import Page, expect


SCREENSHOTS_DIR = pathlib.Path(__file__).parent / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)

PROJECT_ROOT = pathlib.Path(__file__).parent.parent

TEST_HTML_DIR = PROJECT_ROOT / "tests" / "_test_pages"
TEST_HTML_DIR.mkdir(exist_ok=True)


class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


@pytest.fixture(scope="module")
def http_server():
    def handler(*args, **kwargs):
        return CORSHandler(*args, directory=str(PROJECT_ROOT), **kwargs)

    with socketserver.TCPServer(("", 0), handler) as httpd:
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever)
        thread.daemon = True
        thread.start()
        yield f"http://localhost:{port}"
        httpd.shutdown()


@pytest.fixture
def sample_graph_data():
    from node_substrates.utils.graph_conversion import networkx_to_widget_format

    G = nx.karate_club_graph()

    for node in G.nodes():
        G.nodes[node]['degree'] = G.degree(node)
        G.nodes[node]['clustering'] = nx.clustering(G, node)
        G.nodes[node]['random_attr'] = float(node) / len(G.nodes())

    nodes, edges = networkx_to_widget_format(G, width=800, height=600)

    return {"nodes": nodes, "edges": edges}


def create_widget_html(server_url: str, data: dict) -> str:
    data_json = json.dumps(data)

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>NodeSubstrates Visual Test</title>
        <link rel="stylesheet" href="{server_url}/css/widget.css">
        <style>
            body {{
                margin: 0;
                padding: 20px;
                font-family: sans-serif;
            }}
            #widget-container {{
                border: 1px solid #ccc;
                display: inline-block;
                position: relative;
            }}
        </style>
    </head>
    <body>
        <h2>NodeSubstrates Visual Test</h2>
        <div id="widget-container"></div>

        <script type="module">
            const widgetModule = await import('{server_url}/js/dist/index.js');

            class MockModel {{
                constructor(data) {{
                    this._data = {{
                        nodes: data.nodes || [],
                        edges: data.edges || [],
                        substrates: data.substrates || [],
                        dr_method: 'pca',
                        dr_params: {{}},
                        suggested_regions: [],
                        width: 800,
                        height: 600,
                        selected_nodes: [],
                        command: {{}},
                        ready: data.ready !== undefined ? data.ready : true,
                        ...data
                    }};
                    this._callbacks = {{}};
                }}

                get(key) {{
                    return this._data[key];
                }}

                set(key, value) {{
                    this._data[key] = value;
                    this._trigger('change:' + key);
                }}

                save_changes() {{}}

                on(event, callback) {{
                    if (!this._callbacks[event]) {{
                        this._callbacks[event] = [];
                    }}
                    this._callbacks[event].push(callback);
                }}

                _trigger(event) {{
                    const callbacks = this._callbacks[event] || [];
                    callbacks.forEach(cb => cb());
                }}
            }}

            const data = {data_json};

            const model = new MockModel(data);
            const el = document.getElementById('widget-container');

            widgetModule.default.render({{ model, el }});

            window.__WIDGET_RENDERED__ = true;
        </script>
    </body>
    </html>
    """


class TestCoauthorshipExample:

    def test_coauthorship_with_auto_substrate(self, page: Page, http_server):
        from node_substrates.utils.graph_conversion import networkx_to_widget_format
        import networkx as nx

        G = nx.karate_club_graph()

        for node in G.nodes():
            G.nodes[node]['pub_count'] = G.degree(node) * 2
            G.nodes[node]['h_index'] = G.degree(node)
            G.nodes[node]['clustering'] = nx.clustering(G, node)
            G.nodes[node]['betweenness'] = nx.betweenness_centrality(G)[node]
            G.nodes[node]['degree'] = G.degree(node)

        nodes, edges = networkx_to_widget_format(G, width=800, height=600)

        node_ids = [str(i) for i in range(10)]
        substrate = {
            "id": "substrate_0",
            "node_ids": node_ids,
            "projections": [
                {"id": nid, "x": (i % 5 - 2) * 0.4, "y": (i // 5 - 0.5) * 0.8}
                for i, nid in enumerate(node_ids)
            ],
            "dr_method": "umap",
            "label": "Community 1",
            "bounds": {"x": 520, "y": 50, "width": 250, "height": 200}
        }

        data = {
            "nodes": nodes,
            "edges": edges,
            "substrates": [substrate],
            "ready": True
        }

        html_content = create_widget_html(http_server, data)
        html_file = TEST_HTML_DIR / "test_coauthorship.html"
        html_file.write_text(html_content)

        console_messages = []
        page.on("console", lambda msg: console_messages.append(f"{msg.type}: {msg.text}"))

        page.goto(f"{http_server}/tests/_test_pages/test_coauthorship.html")

        page.wait_for_function("window.__WIDGET_RENDERED__ === true", timeout=10000)

        page.wait_for_timeout(500)

        page.screenshot(path=str(SCREENSHOTS_DIR / "coauthorship_example.png"))

        nodes_rendered = page.locator("circle.node")
        expect(nodes_rendered.first).to_be_visible()

        substrate_rect = page.locator("rect.substrate-region")
        expect(substrate_rect).to_be_visible()

    def test_coauthorship_multiple_substrates(self, page: Page, http_server):
        from node_substrates.utils.graph_conversion import networkx_to_widget_format
        import networkx as nx

        G = nx.karate_club_graph()

        for node in G.nodes():
            G.nodes[node]['degree'] = G.degree(node)
            G.nodes[node]['clustering'] = nx.clustering(G, node)
            G.nodes[node]['betweenness'] = nx.betweenness_centrality(G)[node]

        nodes, edges = networkx_to_widget_format(G, width=800, height=600)

        substrate1_ids = [str(i) for i in range(8)]
        substrate2_ids = [str(i) for i in range(20, 28)]

        substrates = [
            {
                "id": "substrate_0",
                "node_ids": substrate1_ids,
                "projections": [
                    {"id": nid, "x": (i % 4 - 1.5) * 0.5, "y": (i // 4 - 0.5) * 0.8}
                    for i, nid in enumerate(substrate1_ids)
                ],
                "dr_method": "umap",
                "label": "Community 1",
                "bounds": {"x": 550, "y": 30, "width": 220, "height": 160}
            },
            {
                "id": "substrate_1",
                "node_ids": substrate2_ids,
                "projections": [
                    {"id": nid, "x": (i % 4 - 1.5) * 0.5, "y": (i // 4 - 0.5) * 0.8}
                    for i, nid in enumerate(substrate2_ids)
                ],
                "dr_method": "pca",
                "label": "Community 2",
                "bounds": {"x": 550, "y": 210, "width": 220, "height": 160}
            }
        ]

        data = {
            "nodes": nodes,
            "edges": edges,
            "substrates": substrates,
            "ready": True
        }

        html_content = create_widget_html(http_server, data)
        html_file = TEST_HTML_DIR / "test_coauthorship_multi.html"
        html_file.write_text(html_content)

        page.goto(f"{http_server}/tests/_test_pages/test_coauthorship_multi.html")

        page.wait_for_function("window.__WIDGET_RENDERED__ === true", timeout=10000)

        page.wait_for_timeout(500)

        page.screenshot(path=str(SCREENSHOTS_DIR / "coauthorship_multi_substrate.png"))

        substrate_rects = page.locator("rect.substrate-region")
        expect(substrate_rects).to_have_count(2)


class TestVisualRendering:

    def test_renders_empty_widget(self, page: Page, http_server):
        console_messages = []
        page.on("console", lambda msg: console_messages.append(f"{msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: console_messages.append(f"ERROR: {err}"))

        html_content = create_widget_html(http_server, {"nodes": [], "edges": []})
        html_file = TEST_HTML_DIR / "test_empty.html"
        html_file.write_text(html_content)

        page.goto(f"{http_server}/tests/_test_pages/test_empty.html")

        try:
            page.wait_for_function("window.__WIDGET_RENDERED__ === true", timeout=10000)
        except Exception:
            print("\nConsole messages:\n" + "\n".join(console_messages))
            raise

        page.screenshot(path=str(SCREENSHOTS_DIR / "empty_widget.png"))

        svg = page.locator("svg.node-substrates")
        expect(svg).to_be_visible()

    def test_renders_graph(self, page: Page, http_server, sample_graph_data):
        html_content = create_widget_html(http_server, sample_graph_data)
        html_file = TEST_HTML_DIR / "test_graph.html"
        html_file.write_text(html_content)

        page.goto(f"{http_server}/tests/_test_pages/test_graph.html")

        page.wait_for_function("window.__WIDGET_RENDERED__ === true", timeout=10000)

        page.wait_for_timeout(500)

        page.screenshot(path=str(SCREENSHOTS_DIR / "graph_rendered.png"))

        nodes = page.locator("circle.node")
        expect(nodes.first).to_be_visible()

    def test_renders_with_substrate(self, page: Page, http_server, sample_graph_data):
        node_ids = [n["id"] for n in sample_graph_data["nodes"][:5]]
        substrate = {
            "id": "test_substrate",
            "node_ids": node_ids,
            "projections": [
                {"id": nid, "x": (i - 2) * 0.4, "y": (i % 2 - 0.5) * 0.8}
                for i, nid in enumerate(node_ids)
            ],
            "dr_method": "pca",
            "label": "Test Substrate",
            "bounds": {"x": 100, "y": 100, "width": 200, "height": 150}
        }

        data_with_substrate = {
            **sample_graph_data,
            "substrates": [substrate]
        }

        html_content = create_widget_html(http_server, data_with_substrate)
        html_file = TEST_HTML_DIR / "test_substrate.html"
        html_file.write_text(html_content)

        page.goto(f"{http_server}/tests/_test_pages/test_substrate.html")

        page.wait_for_function("window.__WIDGET_RENDERED__ === true", timeout=10000)

        page.wait_for_timeout(500)

        page.screenshot(path=str(SCREENSHOTS_DIR / "graph_with_substrate.png"))

        substrate_rect = page.locator("rect.substrate-region")
        expect(substrate_rect).to_be_visible()

    def test_loading_state_shows_overlay(self, page: Page, http_server, sample_graph_data):
        data_not_ready = {
            **sample_graph_data,
            "ready": False
        }

        html_content = create_widget_html(http_server, data_not_ready)
        html_file = TEST_HTML_DIR / "test_loading.html"
        html_file.write_text(html_content)

        page.goto(f"{http_server}/tests/_test_pages/test_loading.html")

        page.wait_for_function("window.__WIDGET_RENDERED__ === true", timeout=10000)

        page.screenshot(path=str(SCREENSHOTS_DIR / "loading_state.png"))

        loading_overlay = page.locator(".loading-overlay")
        expect(loading_overlay).to_be_visible()

        svg = page.locator("svg.node-substrates")
        expect(svg).to_have_css("visibility", "hidden")
