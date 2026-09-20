import { throwIfAborted } from "./retry.ts";

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal | undefined,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (true) {
      throwIfAborted(signal);
      const index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      const item = items[index];
      if (item === undefined) {
        return;
      }
      results[index] = await worker(item, index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
  return results;
}
