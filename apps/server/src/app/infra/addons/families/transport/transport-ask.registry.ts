import { Injectable } from '@harnesys/brix';
import type { TransportAskReply } from '../../../../domain/addons/transport-session.ts';

export type TransportAskHandler = (reply: TransportAskReply) => Promise<boolean>;

@Injectable()
export class TransportAskRegistry {
  private handler: TransportAskHandler | null = null;

  register(handler: TransportAskHandler): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) {
        this.handler = null;
      }
    };
  }

  async tryAnswer(reply: TransportAskReply): Promise<boolean> {
    return (await this.handler?.(reply)) ?? false;
  }
}
