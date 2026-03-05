import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';

@Injectable()
export class MtprotoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MtprotoService.name);
  private client: TelegramClient | null = null;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const apiId = parseInt(this.config.get<string>('telegram.apiId') || '0', 10);
    const apiHash = this.config.get<string>('telegram.apiHash') || '';
    const botToken = this.config.get<string>('telegram.botToken') || '';
    const sessionStr = this.config.get<string>('telegram.session') || '';

    if (!apiId || !apiHash || !botToken) {
      this.logger.warn(
        'MTProto: TELEGRAM_API_ID / TELEGRAM_API_HASH not set. ' +
          'Deletion will fall back to Bot API (48h limit applies).',
      );
      return;
    }

    try {
      const session = new StringSession(sessionStr);
      this.client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
        useWSS: false,
        baseLogger: {
          warn: () => {},
          error: () => {},
          info: () => {},
          debug: () => {},
          trace: () => {},
          child: () => ({ warn: () => {}, error: () => {}, info: () => {}, debug: () => {}, trace: () => {} }) as any,
        } as any,
      });

      await this.client.start({ botAuthToken: botToken });
      this.ready = true;
      this.logger.log('✅ MTProto client connected (no 48h limit on deletions)');
    } catch (err) {
      this.logger.error('MTProto client failed to initialize', err);
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

  /**
   * Delete messages via MTProto — bypasses the Bot API 48-hour limit.
   * Falls back to { deleted: 0, failed: count } if client not ready.
   */
  async deleteMessages(
    chatId: number,
    messageIds: number[],
  ): Promise<{ deleted: number; failed: number }> {
    if (!this.ready || !this.client) {
      return { deleted: 0, failed: messageIds.length };
    }

    let deleted = 0;
    let failed = 0;
    const BATCH = 100;

    try {
      const entity = await this.client.getEntity(chatId);

      for (let i = 0; i < messageIds.length; i += BATCH) {
        const batch = messageIds.slice(i, i + BATCH);
        try {
          await this.client.invoke(
            new Api.channels.DeleteMessages({ channel: entity as any, id: batch }),
          );
          deleted += batch.length;
        } catch {
          // Fallback one-by-one
          for (const id of batch) {
            try {
              await this.client.invoke(
                new Api.channels.DeleteMessages({ channel: entity as any, id: [id] }),
              );
              deleted++;
            } catch {
              failed++;
            }
          }
        }
        if (i + BATCH < messageIds.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } catch (err) {
      this.logger.error('MTProto deleteMessages error', err);
      failed = messageIds.length - deleted;
    }

    return { deleted, failed };
  }
}
