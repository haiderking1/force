export type ClaimedJob<T> = {
  readonly index: number;
  readonly value: T;
};

export type ClaimQueue<T> = {
  claim(): ClaimedJob<T> | undefined;
};

export function createClaimQueue<T>(jobs: readonly T[]): ClaimQueue<T> {
  let next = 0;
  return {
    claim(): ClaimedJob<T> | undefined {
      while (next < jobs.length) {
        const index = next;
        const value = jobs[index];
        next += 1;
        if (value !== undefined) {
          return { index, value };
        }
      }
      return undefined;
    },
  };
}
