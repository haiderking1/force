export type QueuedJob<T> = {
  readonly index: number;
  readonly value: T;
};

export type WorkQueue<T> = {
  enqueue(job: T): void;
  take(): Promise<QueuedJob<T> | undefined>;
  release(): void;
  stop(): void;
};

export function createWorkQueue<T>(initial: readonly T[]): WorkQueue<T> {
  const pending: T[] = [...initial];
  let nextIndex = 0;
  let inFlight = 0;
  let stopped = false;
  let waiters: Array<(entry: QueuedJob<T> | undefined) => void> = [];

  function takeReady(): QueuedJob<T> | undefined {
    const value = pending.shift();
    if (value === undefined) {
      return undefined;
    }
    const index = nextIndex;
    nextIndex += 1;
    return { index, value };
  }

  function flushWaiters(): void {
    if (stopped) {
      const current = waiters;
      waiters = [];
      for (const waiter of current) {
        waiter(undefined);
      }
      return;
    }
    while (waiters.length > 0 && pending.length > 0) {
      const waiter = waiters.shift();
      const ready = takeReady();
      if (waiter === undefined || ready === undefined) {
        if (ready !== undefined) {
          pending.unshift(ready.value);
          nextIndex -= 1;
        }
        return;
      }
      waiter(ready);
    }
    if (waiters.length > 0 && pending.length === 0 && inFlight === 0) {
      const current = waiters;
      waiters = [];
      for (const waiter of current) {
        waiter(undefined);
      }
    }
  }

  return {
    enqueue(job: T) {
      if (stopped) {
        return;
      }
      pending.push(job);
      flushWaiters();
    },
    take() {
      return new Promise<QueuedJob<T> | undefined>((resolve) => {
        waiters.push((entry) => {
          if (entry !== undefined) {
            inFlight += 1;
          }
          resolve(entry);
        });
        flushWaiters();
      });
    },
    release() {
      inFlight = Math.max(0, inFlight - 1);
      flushWaiters();
    },
    stop() {
      stopped = true;
      flushWaiters();
    },
  };
}
