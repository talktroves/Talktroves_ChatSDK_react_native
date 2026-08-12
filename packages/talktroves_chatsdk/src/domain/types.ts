export type MessageSender = 'USER' | 'ASSISTANT' | 'SYSTEM';
export type MessageStatus = 'SENDING' | 'DELIVERED' | 'SEEN';
export type ChatMessageStyle = 'NORMAL' | 'CENTERED_NOTICE';

export type ChatMessage = {
  id: string;
  content: string;
  sender: MessageSender;
  timestamp: Date;
  status?: MessageStatus | null;
  style?: ChatMessageStyle;
  attachmentUri?: string | null;
};

export type VisitorSession = {
  tenantId: string;
  sessionId: string;
};

export type IncomingChatMessage = {
  id: string;
  content: string;
  timestamp: Date;
  status?: MessageStatus;
  style?: ChatMessageStyle;
};

export type IncomingVisitorActivity = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: Date | null;
  agentId?: string | null;
  agentName?: string | null;
  visitorId?: string | null;
};

export type ChatServiceEvent =
  | { type: 'SessionReady'; tenantId: string; sessionId: string }
  | { type: 'Message'; message: IncomingChatMessage }
  | { type: 'Typing'; isTyping: boolean }
  | { type: 'Connection'; isOnline: boolean }
  | { type: 'FormNotice'; message: string }
  | { type: 'SessionEnded' }
  | { type: 'Error'; message: string; cause?: unknown };

export class VisitorChatException extends Error {
  statusCode?: number | null;

  constructor(message: string, statusCode?: number | null, cause?: unknown) {
    super(message);
    this.name = 'VisitorChatException';
    this.statusCode = statusCode ?? null;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}
