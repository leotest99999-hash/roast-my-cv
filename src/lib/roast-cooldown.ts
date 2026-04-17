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
  const windowStart = Date.now() - freeRoastWindowMs;

  return record.roastTimestamps.filter((timestamp) => {
    const parsed = new Date(timestamp).getTime();
    return Number.isFinite(parsed) && parsed >= windowStart;
  });
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
    const remainingRoasts = Math.max(0, freeRoastLimit - activeTimestamps.length);

    if (remainingRoasts > 0) {
      return {
        active: false,
        remainingMs: 0,
        retryAfterSeconds: 0,
        message: null,
        limitReached: false,
        remainingRoasts,
        limit: freeRoastLimit,
        windowHours: freeRoastWindowHours,
        resetAt: activeTimestamps[0] ?? null,
      };
    }

    const oldestTimestamp = activeTimestamps[0];
    const oldestMs = oldestTimestamp
      ? new Date(oldestTimestamp).getTime()
      : Date.now();
    const remainingMs = Math.max(0, oldestMs + freeRoastWindowMs - Date.now());

    return {
      active: true,
      remainingMs,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      message: `You used all ${freeRoastLimit} free roasts for this ${freeRoastWindowHours}-hour window. Try again in ${formatDuration(remainingMs)} or go Pro for unlimited uploads.`,
      limitReached: true,
      remainingRoasts: 0,
      limit: freeRoastLimit,
      windowHours: freeRoastWindowHours,
      resetAt: oldestTimestamp
        ? new Date(oldestMs + freeRoastWindowMs).toISOString()
        : null,
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
  let timestamps: string[] = [];

  if (current) {
    try {
      const record = roastCooldownRecordSchema.parse(JSON.parse(current));
      timestamps = getWindowedTimestamps(record);
    } catch (error) {
      console.error("[roast-cooldown] invalid payload during touch", {
        error,
        key,
      });
    }
  }

  await writeRoastCooldownRecord({
    key,
    roastTimestamps: [...timestamps, now],
    updatedAt: now,
  });

  return getRoastCooldownStatus(key, options);
}
