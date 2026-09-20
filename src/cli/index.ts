import { runCli } from "./run.ts";

const code = await runCli(process.argv.slice(2), {
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exitCode = code;
