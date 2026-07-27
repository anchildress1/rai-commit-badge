import * as core from '@actions/core';
import { run } from './run.js';

try {
  await run();
} catch (error) {
  // a throw is not guaranteed to be an Error; setFailed(undefined) would lose it
  core.setFailed(error instanceof Error ? error.message : String(error));
}
