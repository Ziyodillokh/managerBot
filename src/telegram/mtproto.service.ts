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

type EntityType = 'channel' | 'group';

@Injectable()
export class MtprotoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MtprotoService.name);
  private client: TelegramClient | null = null;
  private ready = false;
  private readonly entityCache = new Map<number, EntityType>();
  private readonly entityObjectCache = new Map<number, any>();

  constructor(private readonly config: ConfigService) {}

  // ──────────────────────────── Init ──────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const apiId = parseInt(this.config.get<string>('telegram.apiId') ?? '0', 10);
    const apiHash = this.config.get<string>('telegram.apiHash') ?? '';
    const sessionStr = this.config.get<string>('telegram.session') ?? '';

    if (!apiId || !apiHash) {
      this.logger.warn(
        'MTProto: TELEGRAM_API_ID / TELEGRAM_API_HASH not set. ' +
          'Falling back to Bot API (48h deletion limit).',
      );
      return;
    }

    if (!sessionStr) {
      this.logger.warn(
        'MTProto: TELEGRAM_SESSION not set. ' +
          'Run `node scripts/generate-session.js` once to get session string, ' +
          'then add it to .env as TELEGRAM_SESSION=<string>',
      );
      return;
    }

    try {
      const session = new StringSession(sessionStr);
      this.client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
        retryDelay: 1000,
        autoReconnect: true,
        useWSS: true,
        baseLogger: {
          warn: () => {},
          error: () => {},
          info: () => {},
          debug: () => {},
          trace: () => {},
          child: () =>
            ({
              warn: () => {},
              error: () => {},
              info: () => {},
              debug: () => {},
              trace: () => {},
            }) as any,
        } as any,
      });

      await this.client.connect();

      const authorized = await this.client.isUserAuthorized();
      if (!authorized) {
        this.logger.error(
          'MTProto: Session expired or invalid. ' +
            'Re-run `node scripts/generate-session.js` to get a new session string.',
        );
        return;
      }

      this.ready = true;
      const me = await this.client.getMe();
      this.logger.log(
        `✅ MTProto USER session connected as ${(me as any).firstName ?? 'user'} — no 48h limit!`,
      );
    } catch (err) {
      this.logger.error('MTProto failed to initialize', err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.client) await this.client.disconnect();
    } catch {}
  }

  isReady(): boolean {
    return this.ready;
  }

  // ──────────────────────── Entity helpers ────────────────────────────────

  /** Detect if chat is channel/supergroup or basic group */
  private async getEntityType(chatId: number): Promise<EntityType> {
    if (this.entityCache.has(chatId)) return this.entityCache.get(chatId)!;
    try {
      const entity = await this.client!.getEntity(chatId);
      this.entityObjectCache.set(chatId, entity);
      // Channel className covers both channels and supergroups
      const t: EntityType =
        entity.className === 'Channel' || entity.className === 'ChannelForbidden'
          ? 'channel'
          : 'group';
      this.entityCache.set(chatId, t);
      return t;
    } catch {
      return 'channel'; // safe default
    }
  }

  private async getEntityObject(chatId: number): Promise<any> {
    if (this.entityObjectCache.has(chatId)) return this.entityObjectCache.get(chatId);
    const entity = await this.client!.getEntity(chatId);
    this.entityObjectCache.set(chatId, entity);
    return entity;
  }

  // ──────────────────────── Single batch delete ───────────────────────────

  private async deleteBatch(
    chatId: number,
    ids: number[],
    entityType: EntityType,
    retries = 3,
  ): Promise<{ deleted: number; failed: number }> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        if (entityType === 'channel') {
          const entity = await this.getEntityObject(chatId);
          await this.client!.invoke(
            new Api.channels.DeleteMessages({ channel: entity, id: ids }),
          );
        } else {
          // Basic group — messages.DeleteMessages, revoke=true deletes for everyone
          await this.client!.invoke(
            new Api.messages.DeleteMessages({ id: ids, revoke: true }),
          );
        }
        return { deleted: ids.length, failed: 0 };
      } catch (err: any) {
        // FLOOD_WAIT — wait required time and retry
        const waitSec = err?.seconds ?? (err?.errorMessage === 'FLOOD_WAIT' ? 30 : 0);
        if (waitSec > 0) {
          this.logger.warn(`FloodWait: waiting ${waitSec}s before retry...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000 + 500));
          continue;
        }
        // MSG_ID_INVALID or CHANNEL_INVALID — messages already gone, count as deleted
        if (
          err?.errorMessage?.includes('MSG_ID_INVALID') ||
          err?.errorMessage?.includes('MESSAGE_ID_INVALID')
        ) {
          return { deleted: ids.length, failed: 0 };
        }
        if (attempt === retries - 1) {
          this.logger.debug(`deleteBatch failed for ${ids.length} ids: ${err?.errorMessage}`);
          return { deleted: 0, failed: ids.length };
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    return { deleted: 0, failed: ids.length };
  }

  // ───────────────── Public: fast parallel deletion ───────────────────────

  /**
   * Delete messages via MTProto USER session — no 48h limit.
   * Uses parallel batches of 100 with FloodWait handling.
   * Automatically detects channel vs basic group.
   */
  async deleteMessages(
    chatId: number,
    messageIds: number[],
  ): Promise<{ deleted: number; failed: number }> {
    if (!this.ready || !this.client) {
      return { deleted: 0, failed: messageIds.length };
    }

    const BATCH_SIZE = 100;
    const CONCURRENCY = 4; // parallel batches

    // Build batches
    const batches: number[][] = [];
    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      batches.push(messageIds.slice(i, i + BATCH_SIZE));
    }

    const entityType = await this.getEntityType(chatId);
    let deleted = 0;
    let failed = 0;

    // Process with concurrency limit
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const window = batches.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        window.map((batch) => this.deleteBatch(chatId, batch, entityType)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          deleted += r.value.deleted;
          failed += r.value.failed;
        } else {
          failed += BATCH_SIZE;
        }
      }
      // Small pause between windows to avoid hitting server limits
      if (i + CONCURRENCY < batches.length) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    return { deleted, failed };
  }
}