export const AUTOSTART_MAX_ATTEMPTS = 5;

export function autostartRetryDelay(attempt: number): number {
  return Math.min(10_000 * 2 ** (attempt - 1), 60_000);
}

export async function runAutostart(
  start: () => number | null,
  wait: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  onRetry: (attempt: number, delayMs: number) => void = (attempt, delayMs) => {
    console.error(`C2C autostart attempt ${attempt}/${AUTOSTART_MAX_ATTEMPTS} failed; retrying in ${Math.round(delayMs / 1000)}s.`);
  },
): Promise<number> {
  for (let attempt = 1; attempt <= AUTOSTART_MAX_ATTEMPTS; attempt += 1) {
    const status = start();
    if (status === 0) return 0;
    if (status === null) return 1;
    if (attempt < AUTOSTART_MAX_ATTEMPTS) {
      const delayMs = autostartRetryDelay(attempt);
      onRetry(attempt, delayMs);
      await wait(delayMs);
    }
  }
  return 1;
}
