// Обёртка над транспортом MCP: пропускает сообщения насквозь и сообщает о каждом.
// Так харнесс видит весь разговор с сервером — рукопожатие, список тулов, вызовы —
// не меняя ни клиент, ни сервер.

import type {
  JSONRPCMessage,
  MessageExtraInfo,
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/client';
import type { McpMessageDirection } from '../events/harnessEvents.js';

export type ObserveMessage = (direction: McpMessageDirection, message: JSONRPCMessage) => void;

export class ObservedTransport implements Transport {
  // Обработчики назначает клиент MCP перед вызовом start().
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <Message extends JSONRPCMessage>(message: Message, extra?: MessageExtraInfo) => void;

  private readonly inner: Transport;
  private readonly observe: ObserveMessage;

  constructor(inner: Transport, observe: ObserveMessage) {
    this.inner = inner;
    this.observe = observe;
  }

  async start(): Promise<void> {
    this.inner.onmessage = (message, extra) => {
      this.observe('from_server', message);
      this.onmessage?.(message, extra);
    };
    this.inner.onclose = () => {
      this.onclose?.();
    };
    this.inner.onerror = (error) => {
      this.onerror?.(error);
    };
    await this.inner.start();
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    this.observe('to_server', message);
    await this.inner.send(message, options);
  }

  async close(): Promise<void> {
    await this.inner.close();
  }

  setProtocolVersion(version: string): void {
    this.inner.setProtocolVersion?.(version);
  }
}
