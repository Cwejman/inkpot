// Root dispatcher — data-driven command registry.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as pdf from './commands/pdf.js';
import * as form from './commands/form.js';
import * as save from './commands/save.js';
import * as load from './commands/load.js';
import * as list from './commands/list.js';

const commands = { pdf, form, save, load, list };

const ROOT_HELP = `Usage: inkpot <command> [options]

Commands:
  list             Print all artboards on the canvas
  pdf <prefix>     Render artboards as a compact PDF
  form <arg>       Render artboards as a fillable PDF
  save <prefix>    Pack artboards into a .inkpot bundle
  load <path>      Unpack a .inkpot bundle into Paper

Run 'inkpot <command> --help' for command-specific options.
Docs: https://github.com/Cwejman/inkpot`;

async function printVersion() {
  const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  console.log(pkg.version);
}

export async function dispatch(argv) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    console.log(ROOT_HELP);
    return;
  }
  if (cmd === '-v' || cmd === '--version') {
    await printVersion();
    return;
  }

  const command = commands[cmd];
  if (!command) {
    console.error(`Unknown command: ${cmd}\n`);
    console.error(ROOT_HELP);
    process.exit(1);
  }

  try {
    await command.run(rest);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
