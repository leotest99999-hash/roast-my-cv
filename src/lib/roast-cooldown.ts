import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { get, put } from "@vercel/blob";
import { z } from "zod";
import { sha256 } from "@/lib/hash";

const roastCooldownPrefix = "roast-cooldowns/";
const localRoastCooldownRoot = join(
  process.cwd(),
  ".data",
  "roast-cooldowns",
);
export const freeRoastLimit = 3;
export const freeRoastWindowHours = 5;
const freeRoastWindowMs = freeRoastWindowHours * 60 * 60 * 1000;

const roastCooldownRecordSchema = z.object({
  key: z.string().min(1),
  roastTimestamps: z.array(z.string().min(1)).default([]),
  cooldownStartedAt: z.string().nullable().default(null),
  updatedAt: z.string().min(1),
});

type RoastCooldownRecord = z.infer<typeof roastCooldownRecordSchema>;

type RoastCooldownIdentity = {
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

function hasBlobStoreToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function canUseLocalFallback() {
  return !hasBlobStoreToken() && process.env.NODE_ENV !== "production";
}

function getCooldownPathname(key: string) {
  return `${roastCooldownPrefix}${key}.json`;
}

function getLocalCooldownPath(key: string) {
  return join(localRoastCooldownRoot, `${key}.json`);
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }

  if (minutes === 0) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function getCooldownEndMs(cooldownStartedAt: string) {
  const startMs = new Date(cooldownStartedAt).getTime();

  if (!Number.isFinite(startMs)) {
    return null;
  }

  return startMs + freeRoastWindowMs;
}

async function readRoastCooldownText(key: string) {
  if (hasBlobStoreToken()) {
    const result = await get(getCooldownPathname(key), {
      access: "private",
    });

    if (!result || result.statusCode !== 200) {
      return null;
    }

    return new Response(result.stream).text();
  }

  if (!canUseLocalFallback()) {
    return null;
  }

  try {
    return await readFile(getLocalCooldownPath(key), "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function writeRoastCooldownRecord(record: RoastCooldownRecord) {
  const content = JSON.stringify(record, null, 2);

  if (hasBlobStoreToken()) {
    await put(getCooldownPathname(record.key), content, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
    });
    return;
  }

  if (!canUseLocalFallback()) {
    return;
  }

  await mkdir(localRoastCooldownRoot, { recursive: true });
  await writeFile(getLocalCooldownPath(record.key), content, "utf8");
}

function getWindowedTimestamps(record: RoastCooldownRecord) {
  return record.roastTimestamps.filter((timestamp) => {
    const parsed = new Date(timestamp).getTime();
    return Number.isFinite(parsed);
  });
}

function getLegacyCooldownStart(timestamps: string[]) {
  if (timestamps.length < freeRoastLimit) {
    return null;
  }

  return timestamps[timestamps.length - 1] ?? null;
}

export function getRoastCooldownKey(identity: RoastCooldownIdentity) {
  if (identity.userId) {
    return `user-${identity.userId}`;
  }

  const fingerprintSource = [
    identity.ipAddress?.trim() || "unknown-ip",
    identity.userAgent?.trim() || "unknown-agent",
  ].join("|");

  return `guest-${sha256(fingerprintSource).slice(0, 24)}`;
}

export async function getRoastCooldownStatus(
  key: string,
  options?: {
    isPro?: boolean;
  },
) {
  if (options?.isPro) {
    return {
      active: false,
      remainingMs: 0,
      retryAfterSeconds: 0,
      message: null,
      limitReached: false,
      remainingRoasts: null,
      limit: freeRoastLimit,
      windowHours: freeRoastWindowHours,
      resetAt: null,
    };
  }

  const stored = await readRoastCooldownText(key);

  if (!stored) {
    return {
      active: false,
      remainingMs: 0,
      retryAfterSeconds: 0,
      message: null,
      limitReached: false,
      remainingRoasts: freeRoastLimit,
      limit: freeRoastLimit,
      windowHours: freeRoastWindowHours,
      resetAt: null,
    };
  }

  try {
    const record = roastCooldownRecordSchema.parse(JSON.parse(stored));
    const activeTimestamps = getWindowedTimestamps(record);
    const cooldownStartedAt =
      record.cooldownStartedAt ?? getLegacyCooldownStart(activeTimestamps);

    if (cooldownStartedAt) {
      const cooldownEndMs = getCooldownEndMs(cooldownStartedAt);

      if (cooldownEndMs && cooldownEndMs > Date.now()) {
        const remainingMs = Math.max(0, cooldownEndMs - Date.now());

        return {
          active: true,
          remainingMs,
          retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
          message: `You used all ${freeRoastLimit} free roasts. The ${freeRoastWindowHours}-hour reset starts after that third roast, and yours unlocks again in ${formatDuration(remainingMs)}. Go Pro if you want unlimited uploads.`,
          limitReached: true,
          remainingRoasts: 0,
          limit: freeRoastLimit,
          windowHours: freeRoastWindowHours,
          resetAt: new Date(cooldownEndMs).toISOString(),
        };
      }
    }

    const remainingRoasts = Math.max(
      0,
      freeRoastLimit - Math.min(activeTimestamps.length, freeRoastLimit),
    );

    return {
      active: false,
      remainingMs: 0,
      retryAfterSeconds: 0,
      message: null,
      limitReached: false,
      remainingRoasts,
      limit: freeRoastLimit,
      windowHours: freeRoastWindowHours,
      resetAt: null,
    };
  } catch (error) {
    console.error("[roast-cooldown] invalid stored payload", {
      error,
      key,
    });

    return {
      active: false,
      remainingMs: 0,
      retryAfterSeconds: 0,
      message: null,
      limitReached: false,
      remainingRoasts: freeRoastLimit,
      limit: freeRoastLimit,
      windowHours: freeRoastWindowHours,
      resetAt: null,
    };
  }
}

function getWritableState(current: RoastCooldownRecord | null) {
  if (!current) {
    return {
      roastTimestamps: [] as string[],
      cooldownStartedAt: null as string | null,
    };
  }

  const activeTimestamps = getWindowedTimestamps(current);
  const cooldownStartedAt =
    current.cooldownStartedAt ?? getLegacyCooldownStart(activeTimestamps);

  if (cooldownStartedAt) {
    const cooldownEndMs = getCooldownEndMs(cooldownStartedAt);

    if (cooldownEndMs && cooldownEndMs > Date.now()) {
      return {
        roastTimestamps: [] as string[],
        cooldownStartedAt,
      };
    }
  }

  return {
    roastTimestamps:
      activeTimestamps.length >= freeRoastLimit ? [] : activeTimestamps,
    cooldownStartedAt: null as string | null,
  };
}

export async function touchRoastCooldown(
  key: string,
  options?: {
    isPro?: boolean;
  },
) {
  if (options?.isPro) {
    return getRoastCooldownStatus(key, options);
  }

  const now = new Date().toISOString();
  const current = await readRoastCooldownText(key);
  let currentRecord: RoastCooldownRecord | null = null;

  if (current) {
    try {
      currentRecord = roastCooldownRecordSchema.parse(JSON.parse(current));
    } catch (error) {
      console.error("[roast-cooldown] invalid payload during touch", {
        error,
        key,
      });
    }
  }

  const writableState = getWritableState(currentRecord);

  if (writableState.cooldownStartedAt) {
    const activeStatus = await getRoastCooldownStatus(key, options);

    if (activeStatus.active) {
      return activeStatus;
    }
  }

  const nextTimestamps = [...writableState.roastTimestamps, now];
  const nextRecord: RoastCooldownRecord = {
    key,
    roastTimestamps: nextTimestamps.length >= freeRoastLimit ? [] : nextTimestamps,
    cooldownStartedAt:
      nextTimestamps.length >= freeRoastLimit ? now : null,
    updatedAt: now,
  };

  await writeRoastCooldownRecord(nextRecord);

  return getRoastCooldownStatus(key, options);
}
