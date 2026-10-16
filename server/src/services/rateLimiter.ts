/** Token bucket: `capacity` burst, refilled at `perSecond` tokens per second. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; last: number }>();

  constructor(
    private readonly perSecond = 5,
    private readonly capacity = 5,
    private readonly now: () => number = Date.now,
  ) {}

  take(id: string, cost = 1): boolean {
    const t = this.now();
    const b = this.buckets.get(id) ?? { tokens: this.capacity, last: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.last) / 1000) * this.perSecond);
    b.last = t;
    const ok = b.tokens >= cost;
    if (ok) b.tokens -= cost;
    this.buckets.set(id, b);
    return ok;
  }

  forget(id: string) {
    this.buckets.delete(id);
  }
}
