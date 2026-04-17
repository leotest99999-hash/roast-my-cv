import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { get, list, put } from "@vercel/blob";
import { z } from "zod";
import { roastAnalysisSchema, type RoastResult } from "@/lib/schemas";

const roastHistoryPrefix = "roast-history/";
const localRoastHistoryRoot = join(process.cwd(), ".data", "roast-history");

export const roastHistoryRecordSchema = roastAnalysisSchema
  .pick({
    score: true,
    atsScore: true,
    scoreLabel: true,
    lead: true,
    summary: true,
    wins: true,
    issues: true,
    upgradePitch: true,
  })
  .extend({
    timestamp: z.string().min(1),
  });

export type RoastHistoryRecord = z.infer<typeof roastHistoryRecordSchema> & {
  id: string;
};

function hasBlobStoreToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function canUseLocalFallback() {
  return !hasBlobStoreToken() && process.env.NODE_ENV !== "production";
}

function getRoastHistoryPrefix(userId: string) {
  return `${roastHistoryPrefix}${userId}/`;
}

function getRoastHistoryPathname(userId: string, timestamp: string) {
  return `${getRoastHistoryPrefix(userId)}${timestamp.replace(/:/g, "-")}.json`;
}

function getLocalRoastHistoryUserRoot(userId: string) {
  return join(localRoastHistoryRoot, userId);
}

function getLocalRoastHistoryPath(userId: string, timestamp: string) {
  return join(
    getLocalRoastHistoryUserRoot(userId),
    `${timestamp.replace(/:/g, "-")}.json`,
  );
}

function toStoredRoastHistory(
  analysis: RoastResult,
  timestamp: string,
) {
  return roastHistoryRecordSchema.parse({
    score: analysis.score,
    atsScore: analysis.atsScore,
    scoreLabel: analysis.scoreLabel,
    lead: analysis.lead,
    summary: analysis.summary,
    wins: analysis.wins,
    issues: analysis.issues,
    upgradePitch: analysis.upgradePitch,
    timestamp,
  });
}

function parseRoastHistoryRecord(
  raw: string,
  id: string,
): RoastHistoryRecord | null {
  try {
    const parsed = roastHistoryRecordSchema.parse(JSON.parse(raw));
    return {
      ...parsed,
      id,
    };
  } catch (error) {
    console.error("[roast-history] invalid stored payload", {
      error,
      id,
    });
    return null;
  }
}

async function readRoastHistoryText(pathname: string) {
  const result = await get(pathname, {
    access: "private",
  });

  if (!result || result.statusCode !== 200) {
    return null;
  }

  return new Response(result.stream).text();
}

export async function saveRoastHistory(
  userId: string,
  analysis: RoastResult,
) {
  const timestamp = new Date().toISOString();
  const record = toStoredRoastHistory(analysis, timestamp);
  const content = JSON.stringify(record, null, 2);

  if (hasBlobStoreToken()) {
    await put(getRoastHistoryPathname(userId, timestamp), content, {
      access: "private",
      allowOverwrite: false,
      addRandomSuffix: false,
      contentType: "application/json",
    });

    return;
  }

  if (!canUseLocalFallback()) {
    return;
  }

  await mkdir(getLocalRoastHistoryUserRoot(userId), { recursive: true });
  await writeFile(
    getLocalRoastHistoryPath(userId, timestamp),
    content,
    "utf8",
  );
}

async function listBlobRoastHistory(userId: string) {
  const blobs: Array<{ pathname: string }> = [];
  let cursor: string | undefined;

  do {
    const page = await list({
      prefix: getRoastHistoryPrefix(userId),
      limit: 1000,
      cursor,
    });

    blobs.push(...page.blobs.map((blob) => ({ pathname: blob.pathname })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const storedEntries = await Promise.all(
    blobs.map(async (blob) => {
      const raw = await readRoastHistoryText(blob.pathname);

      if (!raw) {
        return null;
      }

      return parseRoastHistoryRecord(raw, blob.pathname);
    }),
  );

  return storedEntries.filter((entry): entry is RoastHistoryRecord => Boolean(entry));
}

async function listLocalRoastHistory(userId: string) {
  try {
    const userRoot = getLocalRoastHistoryUserRoot(userId);
    const files = await readdir(userRoot, { withFileTypes: true });
    const entries = await Promise.all(
      files
        .filter((file) => file.isFile() && file.name.endsWith(".json"))
        .map(async (file) => {
          const fullPath = join(userRoot, file.name);
          const raw = await readFile(fullPath, "utf8");
          return parseRoastHistoryRecord(raw, fullPath);
        }),
    );

    return entries.filter((entry): entry is RoastHistoryRecord => Boolean(entry));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }

    throw error;
  }
}

export async function listRoastHistory(userId: string) {
  const entries = hasBlobStoreToken()
    ? await listBlobRoastHistory(userId)
    : canUseLocalFallback()
      ? await listLocalRoastHistory(userId)
      : [];

  return entries.sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  );
}
