import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, filePath);
}

export function createSerialQueue(): (work: () => Promise<void>) => Promise<void> {
  let chain = Promise.resolve();
  return (work) => {
    const run = chain.then(work, work);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
