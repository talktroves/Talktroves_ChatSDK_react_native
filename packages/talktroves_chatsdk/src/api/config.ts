export type TalktrovesChatSDKConfig = {
  baseUrl: string;
  tenantId: string;
  sessionId?: string | null;
  reconnect?: boolean;
  url?: string | null;
  title?: string | null;
  /** Timezone offset in hours, such as 5 for UTC+5. */
  tz?: number | null;
  navigatorLanguage?: string | null;
  isMobile?: boolean;
  domain?: string | null;
  enableSocket?: boolean;
  pollingIntervalMs?: number;
  socketPath?: string | null;
  headers?: Record<string, string>;
};

export type ResolvedTalktrovesChatSDKConfig = {
  baseUrl: string;
  tenantId: string;
  sessionId: string | null;
  reconnect: boolean;
  url: string | null;
  title: string | null;
  tz: number | null;
  navigatorLanguage: string | null;
  isMobile: boolean;
  domain: string | null;
  enableSocket: boolean;
  pollingIntervalMs: number;
  socketPath: string | null;
  headers: Record<string, string>;
};

export function resolveConfig(config: TalktrovesChatSDKConfig): ResolvedTalktrovesChatSDKConfig {
  const trimmedBase = config.baseUrl.trim().replace(/\/+$/, '');
  const trimmedTenant = config.tenantId.trim();
  if (!trimmedBase) {
    throw new Error('TalktrovesChatSDKConfig.baseUrl is required.');
  }
  if (!trimmedTenant) {
    throw new Error('TalktrovesChatSDKConfig.tenantId is required.');
  }
  return {
    baseUrl: trimmedBase,
    tenantId: trimmedTenant,
    sessionId: config.sessionId ?? null,
    reconnect: config.reconnect ?? false,
    url: config.url ?? null,
    title: config.title ?? null,
    tz: config.tz ?? null,
    navigatorLanguage: config.navigatorLanguage ?? null,
    isMobile: config.isMobile ?? true,
    domain: config.domain ?? null,
    enableSocket: config.enableSocket ?? true,
    pollingIntervalMs: config.pollingIntervalMs ?? 3000,
    socketPath: config.socketPath ?? null,
    headers: config.headers ?? {},
  };
}

export const VisitorApiPaths = {
  SESSION: '/chatscript/visitor/session',
  POLLING: '/chatscript/visitor/polling',
  ACTIVITY: '/chatscript/visitor/activity',
} as const;

/** Demo-only public configuration. */
export const TalkTrovesDemoConfig: TalktrovesChatSDKConfig = {
  baseUrl: 'https://App.talktroves.com',
  tenantId: '6a4ebd2deb5fb50e9862d253',
  domain: 'App.talktroves.com',
  url: 'https://App.talktroves.com',
  title: 'Talktroves_ChatSDK Demo',
  tz: 5,
  navigatorLanguage: 'en-US',
  isMobile: true,
  enableSocket: true,
  pollingIntervalMs: 3000,
};
