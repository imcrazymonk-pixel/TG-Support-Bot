import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface StoreData {
  topics: Array<{ userId: number; topicId: number }>;
  banned: number[];
  lastActivity: Array<{ topicId: number; timestamp: number }>;
  pendingCleanup: number[];
}

const userIdToTopicId = new Map<number, number>();
const topicIdToUserId = new Map<number, number>();
const bannedUserIds = new Set<number>();
const topicLastActivity = new Map<number, number>();
const pendingCleanup = new Set<number>();

function persist(): void {
  const data: StoreData = {
    topics: Array.from(userIdToTopicId.entries()).map(([userId, topicId]) => ({ userId, topicId })),
    banned: Array.from(bannedUserIds),
    lastActivity: Array.from(topicLastActivity.entries()).map(([topicId, timestamp]) => ({ topicId, timestamp })),
    pendingCleanup: Array.from(pendingCleanup),
  };
  mkdirSync(dirname(config.SUPPORT_STORE_PATH), { recursive: true });
  const tmpPath = `${config.SUPPORT_STORE_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  renameSync(tmpPath, config.SUPPORT_STORE_PATH);
}

export function load(): void {
  try {
    const raw = readFileSync(config.SUPPORT_STORE_PATH, 'utf-8');
    const data: StoreData = JSON.parse(raw);
    if (!Array.isArray(data.topics) || !Array.isArray(data.banned)) {
      throw new Error('Store file has invalid shape');
    }
    for (const { userId, topicId } of data.topics) {
      userIdToTopicId.set(userId, topicId);
      topicIdToUserId.set(topicId, userId);
    }
    for (const id of data.banned) {
      bannedUserIds.add(id);
    }
    if (Array.isArray(data.lastActivity)) {
      for (const { topicId, timestamp } of data.lastActivity) {
        topicLastActivity.set(topicId, timestamp);
      }
    }
    if (Array.isArray(data.pendingCleanup)) {
      for (const id of data.pendingCleanup) {
        pendingCleanup.add(id);
      }
    }
    console.log(`Store loaded: ${userIdToTopicId.size} topics, ${bannedUserIds.size} banned`);
  } catch (err) {
    if (typeof err === 'object' && err && 'code' in err && (err as { code?: unknown }).code === 'ENOENT') {
      console.log('No existing store found, starting fresh');
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load store: ${message}`);
  }
}

export function getTopicId(userId: number): number | undefined {
  return userIdToTopicId.get(userId);
}

export function getUserId(topicId: number): number | undefined {
  return topicIdToUserId.get(topicId);
}

export function setMapping(userId: number, topicId: number): void {
  userIdToTopicId.set(userId, topicId);
  topicIdToUserId.set(topicId, userId);
  updateLastActivity(topicId);
}

export function removeMapping(userId: number): void {
  const oldTopicId = userIdToTopicId.get(userId);
  if (oldTopicId !== undefined) {
    topicIdToUserId.delete(oldTopicId);
    topicLastActivity.delete(oldTopicId);
    pendingCleanup.delete(oldTopicId);
  }
  userIdToTopicId.delete(userId);
  persist();
}

export function updateLastActivity(topicId: number): void {
  topicLastActivity.set(topicId, Date.now());
  pendingCleanup.delete(topicId);
  persist();
}

export function getInactiveTopicIds(days: number): Array<{ topicId: number; userId: number }> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const result: Array<{ topicId: number; userId: number }> = [];
  for (const [topicId, timestamp] of topicLastActivity) {
    if (timestamp < cutoff) {
      const userId = topicIdToUserId.get(topicId);
      if (userId !== undefined) {
        result.push({ topicId, userId });
      }
    }
  }
  return result;
}

export function isPendingCleanup(topicId: number): boolean {
  return pendingCleanup.has(topicId);
}

export function markPendingCleanup(topicId: number): void {
  pendingCleanup.add(topicId);
  persist();
}

export function clearPendingCleanup(topicId: number): void {
  pendingCleanup.delete(topicId);
  persist();
}

export function isBanned(userId: number): boolean {
  return bannedUserIds.has(userId);
}

export function ban(userId: number): void {
  bannedUserIds.add(userId);
  persist();
}

export function unban(userId: number): boolean {
  const removed = bannedUserIds.delete(userId);
  if (removed) persist();
  return removed;
}
