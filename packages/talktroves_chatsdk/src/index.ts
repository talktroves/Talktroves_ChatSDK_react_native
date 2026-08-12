export { TalktrovesChatSDK } from './TalktrovesChatSDK';
export type { HostProps } from './TalktrovesChatSDK';

export type { TalktrovesChatSDKConfig, ResolvedTalktrovesChatSDKConfig } from './api/config';
export { TalkTrovesDemoConfig, VisitorApiPaths, resolveConfig } from './api/config';
export type { SupportUser } from './api/SupportUser';

export { VisitorChatService } from './data/VisitorChatService';

export type {
  ChatMessage,
  ChatMessageStyle,
  ChatServiceEvent,
  IncomingChatMessage,
  IncomingVisitorActivity,
  MessageSender,
  MessageStatus,
  VisitorSession,
} from './domain/types';
export { VisitorChatException } from './domain/types';

export { Host } from './ui/Host';
export { ChatScreen } from './ui/ChatScreen';
export { Colors as TalktrovesChatSDKColors } from './ui/theme';
export { ChatController } from './state/ChatController';
export type { ChatUiState, DialogKind } from './state/ChatController';
