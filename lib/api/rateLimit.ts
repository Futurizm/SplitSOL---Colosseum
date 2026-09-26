/**
 * Минималистичный rate limit для devnet-фасадки.
 *
 * Счётчики живут в памяти процесса — этого достаточно для хакатона и локальной
 * разработки. Для продакшена нужен внешний стор (Upstash Redis и т.п.),
 * иначе лимит обходится простым запросом на другую реплику.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const buckets = new Map<string, number[]>();

export function rateLimit(
  key: string,
  options: { limit?: number; windowMs?: number } = {},
): RateLimitResult {
  const limit = options.limit ?? 3;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();

  const recent = (buckets.get(key) ?? []).filter((time) => now - time < windowMs);

  if (recent.length >= limit) {
    const oldest = recent[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  recent.push(now);
  buckets.set(key, recent);

  // Периодически подчищаем протухшие бакеты, чтобы карта не росла бесконечно.
  if (buckets.size > 5000) {
    for (const [bucketKey, times] of buckets) {
      if (times.every((time) => now - time >= windowMs)) buckets.delete(bucketKey);
    }
  }

  return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
}
