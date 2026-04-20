# inkpot load

Unpack a `.inkpot` bundle into the live Paper file as a fresh set of artboards.

```sh
inkpot load vp.inkpot              # creates vp/1..vp/N on the canvas
inkpot load vp.inkpot -n hero      # same bundle, imports as hero/1..hero/N
inkpot load vp.inkpot --list       # print contents; don't touch Paper
```

## Rules

- **Filename is the prefix.** `vp.inkpot` loads under prefix `vp`. To load the same file under a different name, use `-n <name>` — no need to rename the file on disk.
- **Placement is automatic.** Artboards form a new vertical column to the *right* of existing canvas content — top-aligned to the canvas's top edge, with a 64px gap between artboards and from the existing bounding box. Empty canvas → origin `(0, 0)`. The column never continues or overlaps an existing one.
- **Collisions abort.** If any `<prefix>/<n>` already exists in Paper, `load` refuses with a message listing the colliding names and suggesting `-n <name>`. It does NOT partially load.

## How it works

1. Read the `.inkpot` file, validate format (no gaps, no unexpected entries, valid headers).
2. Connect to Paper, check for name collisions.
3. Compute target positions (vertical stack below existing bounding box).
4. For each artboard in numeric order: replace `assets/<hash>.<ext>` refs in the JSX with `data:<mime>;base64,…` data URIs, then call `create_artboard` + `write_html`. Paper re-uploads the binary assets and assigns fresh CDN URLs.

## Gotchas

- **Malformed bundle → hard fail.** Missing header comment, non-contiguous indices, unknown top-level entries, or a non-ZIP file all abort with a specific error. No partial loads.
- **Target Paper needs the same fonts.** Bundles don't carry font files — only names. Missing fonts will render with Paper's fallback.
- **Paper's undo handles rollback.** If an MCP call fails mid-load, earlier artboards stay created; use Paper's undo to clean up.

## Flags

| Flag | Default | Purpose |
|---|---|---|
| positional `<path>` | required | `.inkpot` file to load |
| `-n, --name <name>` | = filename stem | Override import prefix |
| `--list` | off | Print bundle contents; don't touch Paper |
| `--mcp-url <url>` | 127.0.0.1:29979 | MCP endpoint |
| `-h, --help` | — | Show help |
