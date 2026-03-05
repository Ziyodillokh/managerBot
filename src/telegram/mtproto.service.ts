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
  entity: any;               // Resolved gramjs entity object (has accessHash)
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
    const apiId = parseInt(this.config.get<string>('telegram.apiId') ?? '0', 10);
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
      this.client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
        connectionRetries: 5,
        retryDelay: 1000,
        autoReconnect: true,
        useWSS: true,
        // Silence internal gramjs logs
        baseLogger: this.silentLogger(),
      } as any);

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
      className === 'Channel' || className === 'ChannelForbidden' ? 'channel' : 'group';

    const entry: PeerEntry = { type, entity };
    this.peerCache.set(chatId, entry);

    this.logger.debug(`Peer resolved: chatId=${chatId} type=${type} (${className})`);
    return entry;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Internal: delete one batch with FloodWait retry
  // ──────────────────────────────────────────────────────────────────────────

  private async deleteBatch(
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
      if (err instanceof FloodWaitError || err?.errorMessage?.startsWith('FLOOD_WAIT')) {
        const waitSec: number = err.seconds ?? 30;
        if (attempt < MAX_ATTEMPTS) {
          this.logger.warn(`FLOOD_WAIT_${waitSec}s — waiting before retry (attempt ${attempt + 1})...`);
          await this.sleep((waitSec + 2) * 1000);
          return this.deleteBatch(peer, ids, attempt + 1);
        }
        this.logger.warn(`FLOOD_WAIT exceeded max retries for ${ids.length} messages.`);
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

      // ── Peer access issue — invalidate cache and retry once ───────────────
      if (
        (msg.includes('CHANNEL_INVALID') || msg.includes('PEER_ID_INVALID')) &&
        attempt === 0
      ) {
        this.logger.warn(`Peer error: ${msg} — invalidating cache and retrying...`);
        // Clear cache so next call re-resolves
        const chatIds = [...this.peerCache.entries()]
          .filter(([, v]) => v.entity === peer.entity)
          .map(([k]) => k);
        for (const id of chatIds) this.peerCache.delete(id);
        return { deleted: 0, failed: ids.length };
      }

      // ── Unknown error ─────────────────────────────────────────────────────
      if (attempt < 2) {
        await this.sleep(1000);
        return this.deleteBatch(peer, ids, attempt + 1);
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
      this.logger.error(`Failed to resolve peer for chatId=${chatId}: ${err?.message ?? err}`);
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
        window.map((batch) => this.deleteBatch(peer, batch)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          deleted += r.value.deleted;
          failed += r.value.failed;
        } else {
          failed += BATCH_SIZE;
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
  //  Utilities
  // ──────────────────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private silentLogger() {
    const noop = () => {};
    const obj = { warn: noop, error: noop, info: noop, debug: noop, trace: noop };
    return { ...obj, child: () => obj };
  }
}