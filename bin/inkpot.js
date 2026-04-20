#!/usr/bin/env node
// inkpot — CLI for Paper design tools.

import { dispatch } from '../src/cli.js';

dispatch(process.argv.slice(2)).catch(err => {
  console.error(err);
  process.exit(1);
});
