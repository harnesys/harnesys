export type AddonTransportMessage = string;

export type AddonTransportHandler = (message: AddonTransportMessage) => void;

export abstract class AddonTransportPort {
  abstract send(message: AddonTransportMessage): void;

  abstract onMessage(handler: AddonTransportHandler): () => void;

  abstract close(): void;
}
