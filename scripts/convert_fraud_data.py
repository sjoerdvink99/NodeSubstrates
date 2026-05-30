#!/usr/bin/env python3
"""Convert insurance-fraud-data.js to insurance-fraud-data.json.

This script properly parses the JavaScript export and converts it to JSON
that preserves all nodes, edges, and attributes exactly.
"""

import json
import re
from pathlib import Path


def parse_js_file(js_path: Path) -> dict:
    """Parse the JavaScript data file and return a Python dict."""
    content = js_path.read_text()
    
    # Remove the license header (multi-line comment at the start)
    content = re.sub(r'^/\*\*[\s\S]*?\*/', '', content)
    
    # Remove the export statement
    content = content.replace('export const insuranceFraudData = ', '')
    
    # Remove trailing semicolon and whitespace
    content = content.strip().rstrip(';').strip()
    
    # Now we have a JavaScript object literal that needs to become JSON
    # Step 1: Handle property names (unquoted -> quoted)
    # Match word characters followed by colon (property names)
    content = re.sub(r'(\s)(\w+)(\s*:)', r'\1"\2"\3', content)
    
    # Also handle property names at the start of a line or after {
    content = re.sub(r'(\{)(\w+)(\s*:)', r'\1"\2"\3', content)
    
    # Step 2: Convert single quotes to double quotes
    content = content.replace("'", '"')
    
    # Step 3: Remove trailing commas (not valid in JSON)
    content = re.sub(r',(\s*[\]}])', r'\1', content)
    
    # Parse as JSON
    try:
        data = json.loads(content)
        return data
    except json.JSONDecodeError as e:
        # Debug: show where the error is
        lines = content.split('\n')
        error_line = content[:e.pos].count('\n')
        print(f"JSON error at line {error_line + 1}, position {e.pos}: {e.msg}")
        print(f"Context: {lines[error_line] if error_line < len(lines) else 'N/A'}")
        raise


def convert_to_networkx_format(js_data: dict) -> dict:
    """Convert from yFiles format to NetworkX JSON format.
    
    The JS file uses:
    - nodesSource: array of nodes with {id, type, enter, exit, info}
    - edgesSource: array of edges with {from, to, type}
    
    NetworkX uses:
    - nodes: array of nodes with {id, ...attributes}
    - links: array of edges with {source, target, ...attributes}
    """
    nodes = []
    for node in js_data.get("nodesSource", []):
        nodes.append({
            "id": node["id"],
            "type": node.get("type"),
            "enter": node.get("enter"),
            "exit": node.get("exit"),
            "info": node.get("info"),
        })
    
    links = []
    for edge in js_data.get("edgesSource", []):
        links.append({
            "source": edge["from"],
            "target": edge["to"],
            "type": edge.get("type"),
        })
    
    return {
        "directed": False,
        "multigraph": False,
        "graph": {},
        "nodes": nodes,
        "links": links,
    }


def main():
    data_dir = Path(__file__).parent.parent / "data"
    js_path = data_dir / "insurance-fraud-data.js"
    json_path = data_dir / "insurance-fraud-data.json"
    
    print(f"Reading: {js_path}")
    js_data = parse_js_file(js_path)
    
    print(f"Parsed {len(js_data.get('nodesSource', []))} nodes")
    print(f"Parsed {len(js_data.get('edgesSource', []))} edges")
    
    # Convert to NetworkX format
    nx_data = convert_to_networkx_format(js_data)
    
    print(f"\nConverted to NetworkX format:")
    print(f"  {len(nx_data['nodes'])} nodes")
    print(f"  {len(nx_data['links'])} links")
    
    # Count by type
    type_counts = {}
    for node in nx_data['nodes']:
        t = node.get('type', 'Unknown')
        type_counts[t] = type_counts.get(t, 0) + 1
    
    print(f"\nNode types:")
    for t, count in sorted(type_counts.items()):
        print(f"  {t}: {count}")
    
    # Write JSON
    print(f"\nWriting: {json_path}")
    with open(json_path, 'w') as f:
        json.dump(nx_data, f, indent=2)
    
    print("Done!")


if __name__ == "__main__":
    main()
