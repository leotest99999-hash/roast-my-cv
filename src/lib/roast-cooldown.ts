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
const oneHourMs = 60 * 60 * 1000;

const roastCooldownRecordSchema = z.object({
  key: z.string().min(1),
  lastRoastAt: z.string().min(1),
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

export async function getRoastCooldownStatus(key: string) {
  const stored = await readRoastCooldownText(key);

  if (!stored) {
    return {
      active: false,
      remainingMs: 0,
      retryAfterSeconds: 0,
      message: null,
    };
  }

  try {
    const record = roastCooldownRecordSchema.parse(JSON.parse(stored));
    const elapsedMs = Date.now() - new Date(record.lastRoastAt).getTime();
    const remainingMs = Math.max(0, oneHourMs - elapsedMs);

    if (remainingMs <= 0) {
      return {
        active: false,
        remainingMs: 0,
        retryAfterSeconds: 0,
        message: null,
      };
    }

    return {
      active: true,
      remainingMs,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      message: `You already got a free roast recently. Try again in ${formatDuration(remainingMs)}.`,
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
    };
  }
}

export async function touchRoastCooldown(key: string) {
  const now = new Date().toISOString();

  await writeRoastCooldownRecord({
    key,
    lastRoastAt: now,
    updatedAt: now,
  });
}
