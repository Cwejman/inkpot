# inkpot save

Pack artboards named `<prefix>/1..N` from the live Paper file into a single `.inkpot` bundle.

```sh
inkpot save vp                     # vp/1..vp/N → vp.inkpot
inkpot save vp -n hero             # pack as hero.inkpot (rename on save)
inkpot save vp -o ~/ship/foo.inkpot
inkpot save vp --list              # preview; don't write
```

## What's in a `.inkpot`

A ZIP archive:

```
vp.inkpot
├── 1.jsx                        one per artboard, N contiguous from 1
├── 2.jsx                        line 1: <!-- inkpot w:W h:H -->
├── ...                          line 2+: JSX body (Paper URLs → assets/ refs)
└── assets/
    └── <hash>.<ext>             content-addressed (SHA-256 prefix, 16 hex)
```

See [SPEC.md §`.inkpot` format](../SPEC.md#inkpot-format-v1) for the full contract.

## How it works

1. Resolve `<prefix>/1..N` from Paper (errors if numbering has gaps).
2. Fetch each artboard's JSX body via MCP (`get_jsx`, format `inline-styles`).
3. Scan every JSX for Paper CDN URLs; fetch each unique URL over HTTP.
4. Hash each asset (SHA-256 truncated to 16 hex chars) and rewrite JSX references to `assets/<hash>.<ext>`.
5. Pack everything into a deterministic ZIP (fixed entry order, zip-epoch timestamps).

## Determinism

Given identical Paper state, two `save` runs produce byte-identical `.inkpot` files. JSX is stored verbatim (no font normalization — that's a PDF-render concern), assets dedupe by content hash, zip entries are sorted (`1.jsx, 2.jsx, …, assets/*` by hash), and every entry's mtime is pinned to `1980-01-01T00:00:00Z`.

## Gotchas

- **Numbering must be contiguous.** `vp/1, vp/3` fails — fill or renumber in Paper.
- **External image URLs are left verbatim.** Only `https://app.paper.design/file-assets/…` URLs are extracted. URLs that come from elsewhere stay as-is in the JSX and may not resolve when the bundle is loaded on a different machine.
- **Fonts are not embedded.** The bundle only stores font *names*. The load target must have the same fonts.

## Flags

| Flag | Default | Purpose |
|---|---|---|
| positional `<prefix>` | required | Input prefix in Paper |
| `-o, --output <path>` | `<prefix>.inkpot` | Output bundle path |
| `-n, --name <name>` | = `<prefix>` | Override output prefix (equivalent to `-o <name>.inkpot`) |
| `--list` | off | Print what would be packed and exit |
| `--mcp-url <url>` | 127.0.0.1:29979 | MCP endpoint |
| `-h, --help` | — | Show help |
