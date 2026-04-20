# inkpot — SPEC

A stateless CLI that moves designs between [Paper](https://paper.design) (via its MCP server) and files. Five commands: `list`, `pdf`, `form`, `save`, `load`.

## Invariants

- **Stateless.** No config, cache, or state beyond CLI args and explicitly named files.
- **Naming is the manifest.** Artboards named `<prefix>/<n>` (integer `n ≥ 1`, contiguous from 1) are the unit of grouping. Ordering is numeric on `n`.
- **Filename is the prefix.** A `.inkpot` file's basename IS the prefix under which its artboards load.
- **Deterministic.** Same inputs → byte-identical outputs across runs.
- **Overwrite without prompt.** Output files are overwritten if they exist. Errors go to stderr, progress to stdout.

## Global CLI

- `-h, --help` on any command prints usage, exits 0.
- `-v, --version` prints version, exits 0.
- `-n <name>` on any command overrides the default name/prefix (see each command).
- `--mcp-url <url>` overrides the Paper endpoint (default `http://127.0.0.1:29979/mcp`).
- Exit codes: `0` success, `1` user error or Paper unreachable.

## Commands

### `list` — print every artboard on the canvas

Read-only. Prints name, dimensions, and node id for each artboard, sorted naturally by name.

### `pdf <prefix>` — render artboards as a compact PDF

Reads `<prefix>/1..N` from Paper; writes a PDF sized to the artboard pixels, or to a named paper size with uniform scaling.

| Flag | Default | |
|---|---|---|
| `-o, --output <path>` | `<prefix>.pdf` | |
| `-n <name>` | = `<prefix>` | override output stem (equivalent to `-o <name>.pdf`) |
| `--page-size <A4\|A5\|Letter>` | artboard px | |
| `--margin <mm>` | 0 | inset from paper edge |
| `--bleed <mm>` | 0 | outset for print handoff |

### `form <arg>` — render a fillable PDF

`<arg>` resolves as artboard name, then id, then prefix. Any text node whose **layer name** matches `{field:<key>}` becomes an AcroForm text field at its rendered position; the node's text is its default value.

| Flag | Default | |
|---|---|---|
| `-o, --output <path>` | `<arg>.pdf` | |
| `-n <name>` | = `<arg>` | override output stem |

### `save <prefix>` — pack artboards into a `.inkpot` file

Reads `<prefix>/1..N` from Paper; writes a bundle (see §Format). Fails if `<prefix>/N` has gaps (not contiguous from 1).

| Flag | Default | |
|---|---|---|
| `-o, --output <path>` | `<prefix>.inkpot` | |
| `-n <name>` | = `<prefix>` | override output prefix (equivalent to `-o <name>.inkpot`) |
| `--list` | — | print what would be packed; don't write |

### `load <path>` — unpack a `.inkpot` file into Paper

Prefix is the file's basename minus `.inkpot`. Creates `<prefix>/1..N` artboards, stacked vertically in a non-colliding region, using the sizes stored in the bundle.

**Placement:** a new vertical column to the right of existing canvas content — left = `max(right-edge of every existing artboard) + 64`, top = `min(top of every existing artboard)`. Empty canvas → origin `(0, 0)`. Consecutive artboards in the column are separated by 64px.

**Refusal:** if any `<prefix>/<n>` already exists, or the bundle is malformed (gaps in indices, unknown top-level entries, missing header, unreadable zip), abort with a message listing the problem. For name collisions, the message prompts: *"rerun with `-n <name>` to import under a different prefix."*

| Flag | Default | |
|---|---|---|
| `-n <name>` | = filename stem | override import prefix |
| `--list` | — | print bundle contents; don't touch Paper |

## `.inkpot` format (v1)

A ZIP archive:

```
<prefix>.inkpot              filename = prefix (external)
├── 1.jsx                    one per artboard, N contiguous from 1
├── 2.jsx
└── assets/
    └── <hash>.<ext>         content-addressed binary assets
```

**`<n>.jsx`** — Line 1: `<!-- inkpot w:<W> h:<H> -->` (integer pixels). Line 2+: the artboard's JSX body with image URLs rewritten to `assets/<hash>.<ext>` relative paths.

**`assets/<hash>.<ext>`** — `<hash>` is the first 16 lowercase hex chars of SHA-256 over the file bytes. Extension from content type (`.png .jpg .svg .webp .gif`).

**Determinism** — Entries in fixed order (JSX by index, then `assets/*` sorted by hash). All entry timestamps pinned to `1980-01-01T00:00:00Z`. No authorship metadata.

## Out of scope

- Git sync, conflict merging, team collaboration flows.
- Multi-prefix bundles (one `.inkpot` = one prefix).
- Font embedding (names only; load target must have the fonts).
- Non-Paper image sources (external URLs left verbatim).
