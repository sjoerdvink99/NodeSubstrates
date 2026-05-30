# Contributing to NodeSubstrates

Thank you for your interest in contributing to NodeSubstrates.

## Reporting Issues

Use the [GitHub issue tracker](https://github.com/sjoerdvink99/node-substrates/issues) to report bugs or request features. When reporting a bug, include:

- A minimal reproducible example
- Your Python version and operating system
- The full error traceback

## Development Setup

```bash
git clone https://github.com/sjoerdvink99/node-substrates.git
cd node-substrates
uv sync --extra dev
bun install
```

Build the JavaScript bundle:

```bash
bun run build
```

Start Jupyter Lab to test changes:

```bash
uv run jupyter lab
```

## Making Changes

**Python** — source code lives in `src/node_substrates/`. Run tests with:

```bash
uv run pytest
```

Lint with:

```bash
uv run ruff check src/ tests/
```

**TypeScript** — source code lives in `js/`. Type-check with:

```bash
bun run typecheck
```

Watch mode for iterative development:

```bash
bun run dev
```

## Code Style

- No inline comments or docstrings
- Python formatting follows `ruff` defaults (line length 120)
- TypeScript uses strict mode

## Pull Request Process

1. Fork the repository and create a branch from `main`
2. Make your changes and ensure all tests pass
3. Ensure `bun run typecheck` passes without errors
4. Submit a pull request with a clear description of the changes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
