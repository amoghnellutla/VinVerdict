// Rebuilds everything that is learned or measured from the labelled data:
// the trained model's scores, the published scorecard (/accuracy) and the
// dataset file (dataset/vinverdict-labelled.jsonl). Then runs every test.
//
//   npm run retrain
//
// Offline and free: no paid API is called.

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const vitest = join(import.meta.dirname, "..", "node_modules", "vitest", "vitest.mjs");
const run = (args, env = {}) => spawnSync(process.execPath, [vitest, ...args], { stdio: "inherit", env: { ...process.env, ...env } }).status ?? 1;

if (run(["run", "src/lib/scam/eval"], { UPDATE_SCORECARD: "1" }) !== 0) process.exit(1);
process.exit(run(["run"]));
