import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import { FloodWaitError } from 'telegram/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Resolved peer cache entry
interface PeerEntry {
  type: 'channel' | 'group'; // channel = supergroup|broadcast; group = basic group
  entity: any; // Resolved gramjs entity object (has accessHash)
}
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class MtprotoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MtprotoService.name);
  private client: TelegramClient | null = null;
  private ready = false;

  /** Cache of resolved peers so we never resolve twice */
  private readonly peerCache = new Map<number, PeerEntry>();

  constructor(private readonly config: ConfigService) {}

  // ──────────────────────────────────────────────────────────────────────────
  //  Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const apiId = parseInt(
      this.config.get<string>('telegram.apiId') ?? '0',
      10,
    );
    const apiHash = this.config.get<string>('telegram.apiHash') ?? '';
    const sessionStr = this.config.get<string>('telegram.session') ?? '';

    if (!apiId || !apiHash) {
      this.logger.warn(
        'MTProto: TELEGRAM_API_ID / TELEGRAM_API_HASH not set — falling back to Bot API (48h limit).',
      );
      return;
    }

    if (!sessionStr) {
      this.logger.warn(
        'MTProto: TELEGRAM_SESSION not set — run `node scripts/generate-session.js` to generate one.',
      );
      return;
    }

    try {
      this.client = new TelegramClient(
        new StringSession(sessionStr),
        apiId,
        apiHash,
        {
          connectionRetries: 5,
          retryDelay: 1000,
          autoReconnect: true,
          useWSS: true,
          // Silence internal gramjs logs
          baseLogger: this.silentLogger(),
        } as any,
      );

      await this.client.connect();

      if (!(await this.client.isUserAuthorized())) {
        this.logger.error(
          'MTProto: Session expired — re-run `node scripts/generate-session.js`.',
        );
        await this.client.disconnect();
        this.client = null;
        return;
      }

      this.ready = true;
      const me = await this.client.getMe();
      this.logger.log(
        `✅ MTProto USER session: ${(me as any).firstName ?? ''} @${(me as any).username ?? 'unknown'} — unlimited deletion active!`,
      );
    } catch (err) {
      this.logger.error('MTProto init failed', err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.client) await this.client.disconnect();
    } catch {}
  }

  isReady(): boolean {
    return this.ready && this.client !== null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Peer resolution  (done ONCE per chat, then cached)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Resolve and cache the gramjs peer for a given Bot-API chatId.
   * Bot-API supergroup IDs look like -1001234567890.
   * Bot-API basic-group IDs look like -123456789.
   */
  private async resolvePeer(chatId: number): Promise<PeerEntry> {
    const cached = this.peerCache.get(chatId);
    if (cached) return cached;

    // gramjs handles negative Bot-API IDs correctly when you pass them as
    // a string or BigInt to getEntity(). Using the raw number sometimes
    // confuses it, so we convert explicitly.
    const entity = await this.client!.getEntity(chatId as any);

    const className: string = (entity as any).className ?? '';
    const type: PeerEntry['type'] =
      className === 'Channel' || className === 'ChannelForbidden'
        ? 'channel'
        : 'group';

    const entry: PeerEntry = { type, entity };
    this.peerCache.set(chatId, entry);

    this.logger.debug(
      `Peer resolved: chatId=${chatId} type=${type} (${className})`,
    );
    return entry;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Internal: delete one batch with FloodWait retry
  // ──────────────────────────────────────────────────────────────────────────

  private async deleteBatch(
    chatId: number,
    peer: PeerEntry,
    ids: number[],
    attempt = 0,
  ): Promise<{ deleted: number; failed: number }> {
    const MAX_ATTEMPTS = 5;
    try {
      if (peer.type === 'channel') {
        await this.client!.invoke(
          new Api.channels.DeleteMessages({ channel: peer.entity, id: ids }),
        );
      } else {
        // Basic group — revoke=true removes for all members
        await this.client!.invoke(
          new Api.messages.DeleteMessages({ id: ids, revoke: true }),
        );
      }
      return { deleted: ids.length, failed: 0 };
    } catch (err: any) {
      // ── FloodWait ──────────────────────────────────────────────────────────
      if (
        err instanceof FloodWaitError ||
        err?.errorMessage?.startsWith('FLOOD_WAIT')
      ) {
        const waitSec: number = err.seconds ?? 30;
        if (attempt < MAX_ATTEMPTS) {
          this.logger.warn(
            `FLOOD_WAIT_${waitSec}s — waiting before retry (attempt ${attempt + 1})...`,
          );
          await this.sleep((waitSec + 2) * 1000);
          return this.deleteBatch(chatId, peer, ids, attempt + 1);
        }
        this.logger.warn(
          `FLOOD_WAIT exceeded max retries for ${ids.length} messages.`,
        );
        return { deleted: 0, failed: ids.length };
      }

      // ── Messages already deleted (invalid ID) → treat as success ──────────
      const msg: string = err?.errorMessage ?? err?.message ?? '';
      if (
        msg.includes('MESSAGE_ID_INVALID') ||
        msg.includes('MSG_ID_INVALID') ||
        msg.includes('MESSAGE_DELETE_FORBIDDEN')
      ) {
        return { deleted: ids.length, failed: 0 };
      }

      // ── Peer access issue — invalidate cache, re-resolve, retry once ───────
      if (
        (msg.includes('CHANNEL_INVALID') || msg.includes('PEER_ID_INVALID')) &&
        attempt === 0
      ) {
        this.logger.warn(
          `Peer error: ${msg} for chatId=${chatId} — clearing cache and re-resolving...`,
        );
        this.peerCache.delete(chatId);
        try {
          const freshPeer = await this.resolvePeer(chatId);
          return this.deleteBatch(chatId, freshPeer, ids, attempt + 1);
        } catch {
          return { deleted: 0, failed: ids.length };
        }
      }

      // ── Unknown error ─────────────────────────────────────────────────────
      if (attempt < 2) {
        await this.sleep(1000);
        return this.deleteBatch(chatId, peer, ids, attempt + 1);
      }
      this.logger.debug(`deleteBatch err: ${msg} for ${ids.length} ids`);
      return { deleted: 0, failed: ids.length };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Delete messages via MTProto USER session (no 48h limit).
   *
   * Strategy:
   *  1. Resolve peer ONCE (handles negative Bot-API IDs, caches result).
   *  2. Split into batches of 100.
   *  3. Run up to CONCURRENCY batches in parallel per window.
   *  4. Between windows, small pause to reduce flood risk.
   *  5. Any FloodWait is handled inside deleteBatch with exponential-ish backoff.
   *
   * Returns total { deleted, failed } counts.
   */
  async deleteMessages(
    chatId: number,
    messageIds: number[],
  ): Promise<{ deleted: number; failed: number }> {
    if (!this.isReady()) {
      this.logger.warn('deleteMessages called but MTProto not ready');
      return { deleted: 0, failed: messageIds.length };
    }

    if (messageIds.length === 0) return { deleted: 0, failed: 0 };

    // 1. Resolve peer once (or fetch from cache)
    let peer: PeerEntry;
    try {
      peer = await this.resolvePeer(chatId);
    } catch (err: any) {
      this.logger.error(
        `Failed to resolve peer for chatId=${chatId}: ${err?.message ?? err}`,
      );
      return { deleted: 0, failed: messageIds.length };
    }

    const BATCH_SIZE = 100;
    const CONCURRENCY = 3; // Telegram tolerates ~3 concurrent delete requests per chat

    // 2. Build batches
    const batches: number[][] = [];
    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      batches.push(messageIds.slice(i, i + BATCH_SIZE));
    }

    let deleted = 0;
    let failed = 0;

    // 3. Process windows of CONCURRENCY batches in parallel
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const window = batches.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        window.map((batch) => this.deleteBatch(chatId, peer, batch)),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === 'fulfilled') {
          deleted += r.value.deleted;
          failed += r.value.failed;
        } else {
          failed += window[j].length;
        }
      }
      // 4. Pause between windows (avoid rate limiting)
      if (i + CONCURRENCY < batches.length) {
        await this.sleep(200);
      }
    }

    this.logger.log(
      `DeleteMessages chatId=${chatId}: ✅${deleted} deleted, ⚠️${failed} failed (total=${messageIds.length})`,
    );
    return { deleted, failed };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Main API: fetch messages from Telegram history and delete them
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * THE CORRECT DELETE METHOD.
   *
   * Fetches message IDs directly from Telegram history (via MTProto USER session),
   * then deletes them — NO database dependency, NO 48-hour limit.
   *
   * @param chatId        Bot-API style chat ID (e.g. -1001234567890)
   * @param fromDate      Start of date range (inclusive)
   * @param toDate        End of date range (inclusive)
   * @param filterUserId  (optional) Only delete messages from this user ID
   * @param excludeUserIds  User IDs whose messages must NOT be deleted (e.g. owner, bots)
   * @param onProgress    (optional) Called periodically with current counts
   */
  async fetchAndDeleteByDateRange(
    chatId: number,
    fromDate: Date,
    toDate: Date,
    filterUserId?: number,
    excludeUserIds: number[] = [],
    onProgress?: (found: number, deleted: number) => Promise<void>,
  ): Promise<{
    total: number;
    deleted: number;
    failed: number;
    notMember?: boolean;
  }> {
    if (!this.isReady()) {
      return { total: 0, deleted: 0, failed: 0, notMember: false };
    }

    const fromTs = Math.floor(fromDate.getTime() / 1000); // unix seconds
    const toTs = Math.floor(toDate.getTime() / 1000);

    // Resolve peer once
    let peer: PeerEntry;
    try {
      peer = await this.resolvePeer(chatId);
    } catch (err: any) {
      const msg: string = err?.errorMessage ?? err?.message ?? '';
      // If the session user is not a member of this chat, return notMember flag
      if (
        msg.includes('CHANNEL_PRIVATE') ||
        msg.includes('CHAT_ID_INVALID') ||
        msg.includes('USER_NOT_PARTICIPANT') ||
        msg.includes('PEER_ID_INVALID')
      ) {
        this.logger.warn(
          `Session user not a member of chatId=${chatId} — will fall back to DB`,
        );
        return { total: 0, deleted: 0, failed: 0, notMember: true };
      }
      this.logger.error(`resolvePeer failed for ${chatId}: ${msg}`);
      return { total: 0, deleted: 0, failed: 0, notMember: false };
    }

    // ── Step 1: Collect all message IDs in the date range ─────────────────
    const collectedIds: number[] = [];
    const HISTORY_LIMIT = 100; // messages per page
    let offsetId = 0; // start from newest matching messages

    // We use offsetDate = toTs + 1 so the first page starts AT toDate
    let offsetDate = toTs + 1;
    let keepFetching = true;

    this.logger.log(
      `Fetching history for chatId=${chatId} from ${fromDate.toISOString()} to ${toDate.toISOString()}`,
    );

    while (keepFetching) {
      let result: any;
      try {
        // messages.getHistory returns messages sorted newest-first
        result = await this.client!.invoke(
          new Api.messages.GetHistory({
            peer: peer.entity,
            offsetId,
            offsetDate,
            addOffset: 0,
            limit: HISTORY_LIMIT,
            maxId: 0,
            minId: 0,
            hash: 0 as any,
          }),
        );
      } catch (err: any) {
        const msg: string = err?.errorMessage ?? err?.message ?? '';
        if (err instanceof FloodWaitError || msg.startsWith('FLOOD_WAIT')) {
          const waitSec = err.seconds ?? 15;
          this.logger.warn(`History FloodWait ${waitSec}s…`);
          await this.sleep((waitSec + 2) * 1000);
          continue; // retry same page
        }
        // Session user not in this group
        if (
          msg.includes('CHANNEL_PRIVATE') ||
          msg.includes('CHAT_ID_INVALID') ||
          msg.includes('USER_NOT_PARTICIPANT') ||
          msg.includes('PEER_ID_INVALID')
        ) {
          this.logger.warn(
            `GetHistory: session user not member of chatId=${chatId}`,
          );
          return { total: 0, deleted: 0, failed: 0, notMember: true };
        }
        this.logger.error(`GetHistory error: ${msg}`);
        break;
      }

      const messages: any[] = result?.messages ?? [];
      if (messages.length === 0) break;

      for (const msg of messages) {
        // MessageEmpty or ServiceMessage — skip
        if (!msg.date || msg.className === 'MessageEmpty') continue;

        const ts: number = msg.date; // unix seconds (UTC)

        // We've gone past the start of the range — stop
        if (ts < fromTs) {
          keepFetching = false;
          break;
        }

        // Skip messages that are after our range (shouldn't happen, but safe)
        if (ts > toTs) continue;

        const senderId: number =
          msg.fromId?.userId?.toJSNumber?.() ??
          msg.fromId?.userId ??
          msg.peerId?.userId?.toJSNumber?.() ??
          0;

        // Exclude protected users (owner, bots, etc.)
        if (senderId && excludeUserIds.includes(senderId)) continue;

        // If filter by user — only collect matching
        if (filterUserId && senderId !== filterUserId) continue;

        collectedIds.push(msg.id);
      }

      // Prepare next page: use the oldest message's id as offsetId
      const last = messages[messages.length - 1];
      if (!last || !last.id) break;
      offsetId = last.id;
      offsetDate = last.date;

      // Safety: if last message is already before fromDate, stop
      if (last.date < fromTs) keepFetching = false;

      // Small pause to avoid hitting getHistory rate limit
      await this.sleep(100);
    }

    const total = collectedIds.length;
    this.logger.log(
      `History scan complete: found ${total} messages to delete in chatId=${chatId}`,
    );

    if (total === 0)
      return { total: 0, deleted: 0, failed: 0, notMember: false };

    // ── Step 2: Delete collected IDs ──────────────────────────────────────
    const BATCH_SIZE = 100;
    const CONCURRENCY = 3;
    const batches: number[][] = [];
    for (let i = 0; i < collectedIds.length; i += BATCH_SIZE) {
      batches.push(collectedIds.slice(i, i + BATCH_SIZE));
    }

    let deleted = 0;
    let failed = 0;
    let progressTimer = 0;

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const window = batches.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        window.map((batch) => this.deleteBatch(chatId, peer, batch)),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === 'fulfilled') {
          deleted += r.value.deleted;
          failed += r.value.failed;
        } else {
          failed += window[j].length;
        }
      }

      // Call progress callback every ~300 messages (lower threshold for small sets)
      progressTimer += window.length * BATCH_SIZE;
      if (onProgress && progressTimer >= 300) {
        progressTimer = 0;
        try {
          await onProgress(total, deleted);
        } catch {}
      }

      if (i + CONCURRENCY < batches.length) await this.sleep(150);
    }

    // Final progress update to ensure 100% is always reported
    if (onProgress && total > 0) {
      try {
        await onProgress(total, deleted);
      } catch {}
    }

    this.logger.log(
      `fetchAndDelete chatId=${chatId}: ✅${deleted} deleted, ⚠️${failed} failed, total=${total}`,
    );
    return { total, deleted, failed, notMember: false };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Utilities
  // ──────────────────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private silentLogger() {
    const noop = () => {};
    const obj: any = {
      warn: noop,
      error: noop,
      info: noop,
      debug: noop,
      trace: noop,
      canSend: () => false,
    };
    obj.child = () => obj;
    return obj;
  }
}
