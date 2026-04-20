# inkpot

CLI for [Paper](https://paper.design) design tools. Four stateless commands that move designs between Paper (via its MCP server) and files.

```sh
npx inkpot pdf vp                # build vp.pdf from Paper frames vp/1, vp/2, ...
npx inkpot form contract         # fillable PDF with AcroForm text fields
npx inkpot save vp               # pack vp/* → vp.inkpot (portable bundle)
npx inkpot load vp.inkpot        # unpack a bundle back into Paper
```

## Commands

| Command | Description |
|---|---|
| `inkpot list` | Print all artboards on the canvas |
| `inkpot pdf <prefix>` | Compact PDF from artboards `<prefix>/1..N` — [docs](docs/pdf.md) |
| `inkpot form <arg>` | Fillable PDF; `{field:<key>}` layer names → AcroForm fields — [docs](docs/form.md) |
| `inkpot save <prefix>` | Pack `<prefix>/1..N` into a `.inkpot` bundle — [docs](docs/save.md) |
| `inkpot load <path>` | Unpack a `.inkpot` bundle into Paper — [docs](docs/load.md) |

Global flags: `-o <path>` / `-n <name>` (output/name), `--mcp-url <url>`, `-h`, `-v`.
Run `inkpot <command> --help` for per-command options. Full contract in [SPEC.md](SPEC.md).

## Install

```sh
npm install -g inkpot
# or run without installing
npx inkpot pdf vp
```

Requires Node.js ≥ 20, Google Chrome (or Chromium), and [Paper](https://paper.design) running with its MCP server enabled (defaults to `http://127.0.0.1:29979/mcp`).

## Why

We're at an odd point in the evolution: AI agents are capable enough to do real design work, but the canvases themselves are monolithic SaaS. Figma owns the collaboration story, but its MCP isn't good enough for AI to be a real peer on the canvas, and everything else about it — format, API, team state — is locked to a single vendor's cloud.

Paper is proprietary too, but its MCP and UI are actually good. That's the lever. inkpot uses Paper's seams to produce outputs that aren't locked to Paper:

- **`pdf` / `form`** — compact PDFs for print, and signable AcroForm contracts straight from a designed layout (a 17-page bloom-heavy deck drops from ~21 MB to ~3 MB).
- **`save` / `load`** — a transparent, inspectable `.inkpot` bundle: plain JSX + assets in a zip. Travels anywhere. Opens next year.

Four small commands — enough to get your designs out of a proprietary canvas and into a form you actually own.

## Design invariants

- **Stateless.** No config, cache, or state beyond CLI args and explicitly named files.
- **Naming is the manifest.** `<prefix>/<n>` (integer, contiguous from 1) groups artboards.
- **Filename is the prefix.** A `.inkpot` file's basename IS the prefix its artboards load under.
- **Deterministic.** Same inputs → byte-identical outputs.
- **Pure core, impure edges.** `src/core/*` never touches IO; `src/io/*` is the only place that talks to Paper, Chrome, the network, or the filesystem.

## Code layout

```
bin/inkpot.js              entry
src/
  cli.js                   dispatch + root help
  commands/{list,pdf,form,save,load}.js   thin orchestrators
  core/                    pure — transformations, no IO
    format.js              .inkpot header, hash, mime, URL patterns
    resolve.js             artboard list → frames
    jsx.js                 URL rewrite ↔ data-URI inline
    bundle.js              buffer ↔ .inkpot contents (fflate)
    layout.js              page geometry (pdf) + placement (load)
    render.js              JSX → HTML (esbuild + React SSR)
    optimize.js            HTML → HTML (blooms, photos)
    fields.js              field marker injection + PDF overlay
  io/                      impure — Paper MCP, Chrome, fetch, fs
test/                      node:test unit tests for core/
```

## License

MIT — see [LICENSE](LICENSE).
