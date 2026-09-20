import { runCli } from "./run.ts";

const controller = new AbortController();
const stop = (): void => {
  controller.abort();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const code = await runCli(process.argv.slice(2), {
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  signal: controller.signal,
});

process.off("SIGINT", stop);
process.off("SIGTERM", stop);
process.exitCode = code;
