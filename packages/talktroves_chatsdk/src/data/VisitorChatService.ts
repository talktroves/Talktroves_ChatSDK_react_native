import { io, Socket } from 'socket.io-client';
import {
  resolveConfig,
  TalktrovesChatSDKConfig,
  ResolvedTalktrovesChatSDKConfig,
  VisitorApiPaths,
} from '../api/config';
import { SupportUser } from '../api/SupportUser';
import {
  ChatServiceEvent,
  IncomingChatMessage,
  IncomingVisitorActivity,
  VisitorChatException,
  VisitorSession,
} from '../domain/types';
import {
  asRecord,
  compactJson,
  parseTimestamp,
  stringOrNull,
  tryParseObject,
  unwrap,
} from './jsonHelpers';

type Listener = (event: ChatServiceEvent) => void;

const MESSAGE_KEYS = ['message', 'text', 'content', 'body', 'msg'] as const;
const SOCKET_MESSAGE_EVENTS = [
  'message_to_client',
  'message-to-client',
  'new message',
  'message',
] as const;

/**
 * Backend visitor chat client (Socket.IO + HTTP polling).
 */
export class VisitorChatService {
  readonly config: ResolvedTalktrovesChatSDKConfig;

  private listeners = new Set<Listener>();
  private seenActivityIds = new Set<string>();
  private pendingOutboundTexts: string[] = [];
  private startLock: Promise<void> | null = null;

  private sessionValue: VisitorSession | null = null;
  private socket: Socket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  private pollingTimestamp = '0';
  private started = false;
  private disposed = false;
  private lifecycleVersion = 0;
  private generatedId = 0;

  constructor(config: TalktrovesChatSDKConfig) {
    this.config = resolveConfig(config);
  }

  get session(): VisitorSession | null {
    return this.sessionValue;
  }

  get isStarted(): boolean {
    return this.started;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    this.assertNotDisposed();
    if (this.started && this.sessionValue != null) return;

    if (this.startLock) {
      await this.startLock;
      return;
    }

    this.startLock = (async () => {
      if (this.started && this.sessionValue != null) return;
      const version = ++this.lifecycleVersion;
      this.started = true;
      try {
        await this.startInternal(version);
      } catch (cause) {
        if (version === this.lifecycleVersion) {
          this.started = false;
          this.emit({
            type: 'Error',
            message: 'Failed to create visitor session',
            cause,
          });
        }
        throw cause;
      } finally {
        this.startLock = null;
      }
    })();

    await this.startLock;
  }

  private async startInternal(version: number): Promise<void> {
    const session = await this.createSession();
    if (!this.started || version !== this.lifecycleVersion) return;
    this.sessionValue = session;
    this.emit({
      type: 'SessionReady',
      tenantId: session.tenantId,
      sessionId: session.sessionId,
    });
    this.attachPolling(session, version);
    if (this.config.enableSocket) {
      this.attachSocket(session, version);
    }
  }

  async sendMessage(content: string, user?: SupportUser | null): Promise<void> {
    const session = this.requireSession();
    const trimmed = content.trim();
    if (trimmed.length > 0) {
      this.pendingOutboundTexts.push(trimmed);
      while (this.pendingOutboundTexts.length > 50) {
        this.pendingOutboundTexts.shift();
      }
    }
    const visitorName =
      user?.name?.trim() || `Visitor ${Date.now()}`;
    const clientSideId = Date.now();
    const activity = {
      visitorId: session.sessionId,
      type: 'message',
      hidden: false,
      data: {
        message: content,
        agentLanguage: '',
        clientSideId,
        name: visitorName,
      },
    };
    await this.postActivity(session.tenantId, activity);
    if (this.socket?.connected) {
      this.socket.emit('new message', {
        visitorId: session.sessionId,
        message: content,
        name: visitorName,
        clientSideId,
      });
    }
  }

  async updateVisitorInfo(name: string, email: string): Promise<void> {
    const session = this.requireSession();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName && !trimmedEmail) {
      throw new Error('Name or email must be provided.');
    }
    if (trimmedName) await this.sendFormField(session, 'name', trimmedName);
    if (trimmedEmail) await this.sendFormField(session, 'email', trimmedEmail);
  }

  async sendTyping(isTyping: boolean): Promise<void> {
    const session = this.sessionValue;
    if (!session) return;
    if (this.socket?.connected) {
      this.socket.emit('typing', { typing: isTyping });
    }
    await this.postActivity(session.tenantId, {
      visitorId: session.sessionId,
      type: 'typing',
      hidden: false,
      data: {
        typing: isTyping,
        agentLanguage: '',
        clientSideId: Date.now(),
        name: 'Visitor',
      },
    });
  }

  async logout(): Promise<void> {
    const session = this.sessionValue;
    if (session) {
      try {
        await this.postActivity(session.tenantId, {
          visitorId: session.sessionId,
          type: 'visitorStatus',
          hidden: false,
          data: { status: 'ended' },
        });
      } catch {
        // Logout cleanup must still complete.
      }
    }
    this.stop();
    this.sessionValue = null;
    this.seenActivityIds.clear();
    this.pendingOutboundTexts = [];
    this.pollingTimestamp = '0';
    this.emit({ type: 'SessionEnded' });
  }

  stop(): void {
    this.started = false;
    this.lifecycleVersion += 1;
    this.stopPolling();
    this.disconnectSocket();
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.listeners.clear();
  }

  private async createSession(): Promise<VisitorSession> {
    const body = compactJson({
      tenantId: this.config.tenantId,
      sessionId: this.config.sessionId,
      reconnect: this.config.reconnect,
      url: this.config.url,
      title: this.config.title,
      tz: this.config.tz,
      navigatorLanguage: this.config.navigatorLanguage,
      isMobile: this.config.isMobile,
      domain: this.config.domain,
    });
    const response = await this.requestJson(VisitorApiPaths.SESSION, 'POST', JSON.stringify(body));
    const root = asRecord(response) ?? {};
    const data = asRecord(root.data);
    const isSuccess =
      Boolean(root.isSuccess) || Boolean(root.success) || data != null;
    const sessionId = stringOrNull(data, 'sessionId') ?? stringOrNull(root, 'sessionId');
    if (!isSuccess || !sessionId) {
      throw new VisitorChatException(
        stringOrNull(root, 'message', 'error') ?? 'Session response missing sessionId',
      );
    }
    return {
      tenantId:
        stringOrNull(data, 'tenantId') ??
        stringOrNull(root, 'tenantId') ??
        this.config.tenantId,
      sessionId,
    };
  }

  private async sendFormField(
    session: VisitorSession,
    key: string,
    value: string,
  ): Promise<void> {
    await this.postActivity(session.tenantId, {
      visitorId: session.sessionId,
      type: 'forms',
      hidden: false,
      data: [{ key, value }],
    });
  }

  private async postActivity(
    tenantId: string,
    activity: Record<string, unknown>,
  ): Promise<void> {
    const body = {
      activity,
      tid: tenantId,
      queryFrom: 'visitors',
    };
    const response = await this.requestJson(
      VisitorApiPaths.ACTIVITY,
      'POST',
      JSON.stringify(body),
    );
    const root = asRecord(response);
    if (!root) return;
    const isSuccess = root.isSuccess !== false;
    const isServerError = Boolean(root.isServerError);
    if ((!isSuccess || isServerError) && !root.isSuccess) {
      const serverError = asRecord(root.serverError);
      throw new VisitorChatException(
        stringOrNull(root, 'message') ??
          stringOrNull(serverError, 'message') ??
          'Activity rejected by server',
      );
    }
  }

  private attachPolling(session: VisitorSession, version: number): void {
    this.stopPolling();
    void this.pollOnce(session, version);
    this.pollTimer = setInterval(() => {
      void this.pollOnce(session, version);
    }, this.config.pollingIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollInFlight = false;
  }

  private async pollOnce(session: VisitorSession, version: number): Promise<void> {
    if (this.pollInFlight || !this.started || version !== this.lifecycleVersion) return;
    this.pollInFlight = true;
    try {
      const query = new URLSearchParams({
        tid: session.tenantId,
        sid: session.sessionId,
        ts: this.pollingTimestamp,
      }).toString();
      const response = await this.requestJson(
        `${VisitorApiPaths.POLLING}?${query}`,
        'GET',
      );
      if (!this.started || version !== this.lifecycleVersion) return;
      const parsed = this.parsePollingResponse(response);
      this.pollingTimestamp = parsed.nextTimestamp;
      this.handleIncomingActivities(parsed.activities);
    } catch (cause) {
      if (this.started && version === this.lifecycleVersion) {
        this.emit({ type: 'Error', message: 'Polling failed', cause });
      }
    } finally {
      this.pollInFlight = false;
    }
  }

  private parsePollingResponse(response: unknown): {
    activities: IncomingVisitorActivity[];
    nextTimestamp: string;
  } {
    if (Array.isArray(response)) {
      return {
        activities: response
          .map((item) => this.parseIncomingActivity(item))
          .filter((a): a is IncomingVisitorActivity => a != null),
        nextTimestamp: this.pollingTimestamp,
      };
    }
    const root = asRecord(response);
    if (!root) {
      return { activities: [], nextTimestamp: this.pollingTimestamp };
    }
    const data = asRecord(root.data);
    let rawActivities: unknown =
      data?.activities ??
      data?.items ??
      data?.messages ??
      root.activities ??
      root.items ??
      root.messages ??
      root.data;
    if (!Array.isArray(rawActivities)) {
      rawActivities = [];
    }
    const activities = (rawActivities as unknown[])
      .map((item) => this.parseIncomingActivity(item))
      .filter((a): a is IncomingVisitorActivity => a != null);
    const cursor =
      stringOrNull(root, 'nextTimestamp', 'ts', 'timestamp') ??
      stringOrNull(data, 'nextTimestamp', 'ts', 'timestamp');
    return {
      activities,
      nextTimestamp: cursor ?? this.pollingTimestamp,
    };
  }

  private attachSocket(session: VisitorSession, version: number): void {
    this.disconnectSocket();
    const created = io(this.config.baseUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      path: this.config.socketPath ?? undefined,
      query: {
        tenantId: session.tenantId,
        connectionId: session.sessionId,
        visitorId: session.sessionId,
        type: 'visitors',
      },
    });
    this.socket = created;

    created.on('connect', () => {
      if (this.isCurrentSocket(created, version)) {
        this.emit({ type: 'Connection', isOnline: true });
      }
    });
    created.on('disconnect', () => {
      if (this.isCurrentSocket(created, version)) {
        this.emit({ type: 'Connection', isOnline: false });
      }
    });
    created.on('connect_error', () => {
      if (this.isCurrentSocket(created, version)) {
        this.emit({ type: 'Connection', isOnline: false });
      }
    });
    for (const eventName of SOCKET_MESSAGE_EVENTS) {
      created.on(eventName, (...args: unknown[]) => {
        if (this.isCurrentSocket(created, version)) {
          this.handleSocketPayload(args[0]);
        }
      });
    }
    created.on('message-typing', () => {
      if (this.isCurrentSocket(created, version)) {
        this.emit({ type: 'Typing', isTyping: true });
      }
    });
    created.on('typing', (...args: unknown[]) => {
      if (!this.isCurrentSocket(created, version)) return;
      const map = asRecord(args[0]);
      const typing =
        map != null
          ? Boolean(map.typing) || Boolean(map.isTyping)
          : args[0] === true;
      this.emit({ type: 'Typing', isTyping: typing });
    });
  }

  private isCurrentSocket(candidate: Socket, version: number): boolean {
    return this.started && this.socket === candidate && this.lifecycleVersion === version;
  }

  private disconnectSocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private handleSocketPayload(raw: unknown): void {
    if (Array.isArray(raw)) {
      for (const item of raw) this.handleSocketPayload(item);
      return;
    }
    if (typeof raw === 'string') {
      const parsed = tryParseObject(raw.trim());
      this.handleSocketPayload(
        parsed ?? { message: raw, type: 'message' },
      );
      return;
    }
    let map = asRecord(raw);
    if (!map) return;
    const nested = asRecord(map.activity);
    if (nested && map.data == null && map.message == null) {
      map = { ...nested, ...map };
    }
    const activity = this.parseIncomingActivity(map, true);
    if (!activity) return;
    this.handleIncomingActivities([activity]);
    this.emit({ type: 'Typing', isTyping: false });
  }

  private parseIncomingActivity(
    raw: unknown,
    socketPayload = false,
  ): IncomingVisitorActivity | null {
    const map = asRecord(raw);
    if (!map) return null;
    const dataObj = map.data;
    let data: Record<string, unknown> = {};
    if (dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj)) {
      data = { ...(unwrap(dataObj) as Record<string, unknown>) };
    } else if (Array.isArray(dataObj)) {
      data = { _items: unwrap(dataObj) };
    } else {
      for (const key of MESSAGE_KEYS) {
        if (map[key] != null) data[key] = unwrap(map[key]);
      }
    }
    const timestamp =
      parseTimestamp(map.timestamp ?? map.createdAt ?? map.ts) ??
      (socketPayload ? new Date() : null);
    return {
      id:
        stringOrNull(map, 'id', '_id', 'activityId') ??
        this.nextGeneratedId(socketPayload ? 'socket' : 'poll'),
      type: stringOrNull(map, 'type', 'event') ?? 'message',
      data,
      timestamp,
      agentId: stringOrNull(map, 'agentId'),
      agentName: stringOrNull(map, 'agentName'),
      visitorId: stringOrNull(map, 'visitorId'),
    };
  }

  private handleIncomingActivities(activities: IncomingVisitorActivity[]): void {
    for (const activity of activities) {
      if (this.seenActivityIds.has(activity.id)) continue;
      this.seenActivityIds.add(activity.id);

      if (isTypingActivity(activity)) {
        if (isFromAgent(activity)) {
          this.emit({ type: 'Typing', isTyping: true });
        }
        continue;
      }
      if (isStatusActivity(activity)) continue;
      if (activity.type.toLowerCase() === 'forms') {
        const notice = displayMessage(activity);
        if (notice) this.emit({ type: 'FormNotice', message: notice });
        continue;
      }
      if (!this.shouldDisplayAsInboundMessage(activity)) continue;
      const text = messageText(activity)?.trim() ?? '';
      if (!text) continue;
      this.emit({ type: 'Typing', isTyping: false });
      this.emit({
        type: 'Message',
        message: {
          id: activity.id,
          content: text,
          timestamp: activity.timestamp ?? new Date(),
          status: 'SEEN',
        },
      });
    }
  }

  private shouldDisplayAsInboundMessage(activity: IncomingVisitorActivity): boolean {
    if (isStatusActivity(activity) || isTypingActivity(activity)) return false;
    const text = messageText(activity)?.trim() ?? '';
    if (!text) return false;
    if (!isMessageActivity(activity) && !isFromAgent(activity)) return false;
    if (isFromAgent(activity)) return true;
    const index = this.pendingOutboundTexts.indexOf(text);
    if (index >= 0) {
      this.pendingOutboundTexts.splice(index, 1);
      return false;
    }
    return true;
  }

  private async requestJson(
    path: string,
    method: string,
    body?: string,
  ): Promise<unknown> {
    this.assertNotDisposed();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.config.headers,
    };
    const init: RequestInit = { method, headers };
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      init.body = body ?? '{}';
    }
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, init);
      const text = await response.text();
      let parsed: unknown = {};
      if (text.trim()) {
        parsed = JSON.parse(text);
      }
      if (!response.ok) {
        throw new VisitorChatException(
          `Visitor API request failed: ${method} ${path}`,
          response.status,
        );
      }
      return parsed;
    } catch (cause) {
      if (cause instanceof VisitorChatException) throw cause;
      throw new VisitorChatException(
        `Visitor API request failed: ${method} ${path}`,
        null,
        cause,
      );
    }
  }

  private requireSession(): VisitorSession {
    if (!this.sessionValue) {
      throw new Error(
        'Visitor session not ready. Call start() first (POST /chatscript/visitor/session).',
      );
    }
    return this.sessionValue;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('VisitorChatService has been disposed.');
    }
  }

  private nextGeneratedId(channel: string): string {
    this.generatedId += 1;
    return `${channel}-${Date.now()}-${this.generatedId}`;
  }

  private emit(event: ChatServiceEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener failures.
      }
    }
  }
}

function isTypingActivity(activity: IncomingVisitorActivity): boolean {
  const type = activity.type.toLowerCase();
  return (
    type.includes('typing') ||
    activity.data.typing === true ||
    activity.data.isTyping === true
  );
}

function looksLikeStatusType(type: string): boolean {
  const lower = type.toLowerCase();
  return lower.includes('status') || lower === 'visitorstatus';
}

function isStatusActivity(activity: IncomingVisitorActivity): boolean {
  return (
    looksLikeStatusType(activity.type) ||
    (activity.data.status != null && firstMessageValue(activity.data) == null)
  );
}

function isMessageActivity(activity: IncomingVisitorActivity): boolean {
  return (
    !isTypingActivity(activity) &&
    !isStatusActivity(activity) &&
    activity.type.toLowerCase() !== 'forms' &&
    Boolean(messageText(activity)?.trim())
  );
}

function isFromAgent(activity: IncomingVisitorActivity): boolean {
  const agentId = activity.agentId?.trim().toLowerCase();
  const agentName = activity.agentName?.trim().toLowerCase();
  if ((agentId && agentId !== 'null') || (agentName && agentName !== 'null')) {
    return true;
  }
  if (
    activity.data.isBot === true ||
    activity.data.fromBot === true ||
    activity.data.isAgent === true
  ) {
    return true;
  }
  const type = activity.type.toLowerCase();
  if (['agent', 'bot', 'assistant', 'chatbot'].some((t) => type.includes(t))) {
    return true;
  }
  const from = String(
    activity.data.from ??
      activity.data.sender ??
      activity.data.source ??
      activity.data.role ??
      '',
  ).toLowerCase();
  return ['agent', 'bot', 'assistant', 'chatbot', 'system'].includes(from);
}

function normalizeFormData(data: Record<string, unknown>): Record<string, unknown> {
  const items = data._items;
  if (!Array.isArray(items)) return data;
  const fields: Record<string, unknown> = {};
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const field = item as Record<string, unknown>;
    const key = field.key != null ? String(field.key) : '';
    if (key) fields[key] = field.value;
  }
  return fields;
}

function displayMessage(activity: IncomingVisitorActivity): string | null {
  const fields = normalizeFormData(activity.data);
  const value = fields.displayMessage ?? fields.display_message;
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function firstMessageValue(data: Record<string, unknown>): unknown {
  for (const key of MESSAGE_KEYS) {
    if (data[key] != null) return data[key];
  }
  return null;
}

function messageText(activity: IncomingVisitorActivity): string | null {
  const raw = firstMessageValue(activity.data);
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const decoded = tryParseObject(trimmed);
      if (decoded) {
        const nestedType = stringOrNull(decoded, 'type', 'event') ?? '';
        const nestedData = asRecord(decoded.data) ?? {};
        if (
          looksLikeStatusType(nestedType) ||
          (nestedData.status != null && firstMessageValue(nestedData) == null)
        ) {
          return null;
        }
        const nestedMessage =
          firstMessageValue(nestedData) ?? firstMessageValue(decoded);
        if (nestedMessage != null) return String(nestedMessage);
        if ('type' in decoded && 'data' in decoded) return null;
      }
    }
    return raw;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (raw && typeof raw === 'object') {
    const nested = firstMessageValue(raw as Record<string, unknown>);
    return nested != null ? String(nested) : String(raw);
  }
  return String(raw);
}
