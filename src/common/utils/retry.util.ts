export type RetryOptions = {
  retries: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
};

export async function retryAsync<T>(
  task: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { retries, initialDelayMs = 300, maxDelayMs = 5000, factor = 2 } = options;
  let attempt = 0;
  let delay = initialDelayMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await task();
    } catch (error) {
      attempt += 1;
      if (attempt > retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, maxDelayMs)));
      delay *= factor;
    }
  }
}

