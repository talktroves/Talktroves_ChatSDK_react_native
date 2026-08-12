import type { SupportUser } from '../api/SupportUser';
import { VisitorChatService } from '../data/VisitorChatService';
import type {
  ChatMessage,
  ChatMessageStyle,
  ChatServiceEvent,
  MessageSender,
  MessageStatus,
} from '../domain/types';

export type DialogKind = 'CONTACT' | 'TRANSCRIPT';

export type ChatUiState = {
  messages: ChatMessage[];
  text: string;
  isOnline: boolean;
  isTyping: boolean;
  sessionReady: boolean;
  sessionEnded: boolean;
  menuOpen: boolean;
  soundOn: boolean;
  dialog: DialogKind | null;
  user: SupportUser;
  attachmentUri: string | null;
  savingDialog: boolean;
};

function nowMessage(
  content: string,
  sender: MessageSender,
  status?: MessageStatus | null,
  style: ChatMessageStyle = 'NORMAL',
  attachmentUri?: string | null,
): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    content,
    sender,
    timestamp: new Date(),
    status: status ?? null,
    style,
    attachmentUri: attachmentUri ?? null,
  };
}

function createInitialState(): ChatUiState {
  return {
    messages: [
      nowMessage('ended the chat', 'SYSTEM'),
      nowMessage('Hi! How can I help you today?', 'ASSISTANT'),
    ],
    text: '',
    isOnline: true,
    isTyping: false,
    sessionReady: false,
    sessionEnded: false,
    menuOpen: false,
    soundOn: true,
    dialog: null,
    user: {
      name: 'Flutter Dummy User',
      email: 'flutter-dummy@example.com',
    },
    attachmentUri: null,
    savingDialog: false,
  };
}

type Listener = () => void;

/**
 * UI controller mirroring Talktroves_ChatSDKViewModel.
 */
export class ChatController {
  private state: ChatUiState = createInitialState();
  private listeners = new Set<Listener>();
  private unsubscribeService: (() => void) | null = null;
  private typingClearTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly service: VisitorChatService) {
    this.unsubscribeService = service.subscribe((event) => this.onEvent(event));
    void this.bootstrap();
  }

  getState(): ChatUiState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.unsubscribeService?.();
    this.unsubscribeService = null;
    if (this.typingClearTimer) {
      clearTimeout(this.typingClearTimer);
      this.typingClearTimer = null;
    }
    this.listeners.clear();
  }

  onTextChange(value: string): void {
    this.update({ text: value });
  }

  setMenuOpen(open: boolean): void {
    this.update({ menuOpen: open });
  }

  toggleSound(): void {
    this.update({ soundOn: !this.state.soundOn });
  }

  openDialog(kind: DialogKind): void {
    this.update({ dialog: kind, menuOpen: false });
  }

  closeDialog(): void {
    this.update({ dialog: null, savingDialog: false });
  }

  setAttachment(uri: string | null): void {
    this.update({ attachmentUri: uri, menuOpen: false });
  }

  send(): void {
    const current = this.state;
    const trimmed = current.text.trim();
    if (!trimmed && !current.attachmentUri) return;
    if (!current.sessionReady || current.sessionEnded) {
      this.update({
        messages: [
          ...current.messages,
          nowMessage(
            current.sessionEnded
              ? 'Chat ended. Please start a new session.'
              : 'Please wait — creating visitor session...',
            'SYSTEM',
          ),
        ],
      });
      return;
    }
    const content = trimmed || 'Sent an image attachment';
    const outgoing = nowMessage(
      content,
      'USER',
      'SENDING',
      'NORMAL',
      current.attachmentUri,
    );
    this.update({
      messages: [...current.messages, outgoing],
      text: '',
      attachmentUri: null,
      isTyping: true,
    });

    setTimeout(() => {
      this.update({
        messages: this.state.messages.map((message) =>
          message.id === outgoing.id
            ? { ...message, status: 'DELIVERED' as MessageStatus }
            : message,
        ),
      });
    }, 500);

    void (async () => {
      try {
        await this.service.sendMessage(content, current.user);
        if (this.typingClearTimer) clearTimeout(this.typingClearTimer);
        this.typingClearTimer = setTimeout(() => {
          this.update({ isTyping: false });
        }, 45_000);
      } catch {
        this.update({
          isTyping: false,
          messages: [
            ...this.state.messages,
            nowMessage(
              'Error: Could not connect to support. Please try again.',
              'SYSTEM',
            ),
          ],
        });
      }
    })();
  }

  async saveContact(
    name: string,
    email: string,
    onTranscriptSaved: (email: string) => void,
    onError: (message: string) => void,
  ): Promise<void> {
    const dialog = this.state.dialog;
    if (!dialog) return;
    this.update({ savingDialog: true });
    try {
      await this.service.updateVisitorInfo(name, email);
      this.update({
        user: { name, email },
        dialog: null,
        savingDialog: false,
      });
      if (dialog === 'TRANSCRIPT') {
        onTranscriptSaved(email);
      }
    } catch {
      this.update({ savingDialog: false });
      onError(
        dialog === 'TRANSCRIPT'
          ? 'Could not request transcript.'
          : 'Could not update contact details.',
      );
    }
  }

  async endChat(onEnded: () => void): Promise<void> {
    try {
      await this.service.logout();
    } finally {
      onEnded();
    }
  }

  private async bootstrap(): Promise<void> {
    try {
      await this.service.start();
    } catch {
      this.update({
        isOnline: false,
        messages: [
          ...this.state.messages,
          nowMessage(
            'Error: Could not start support session. Please try again.',
            'SYSTEM',
          ),
        ],
      });
    }
  }

  private onEvent(event: ChatServiceEvent): void {
    switch (event.type) {
      case 'SessionReady':
        this.update({
          sessionReady: true,
          sessionEnded: false,
          isOnline: true,
        });
        break;
      case 'Message':
        this.update({
          messages: [
            ...this.state.messages,
            {
              id: event.message.id,
              content: event.message.content,
              sender: 'ASSISTANT',
              timestamp: event.message.timestamp,
              status: event.message.status ?? 'SEEN',
              style: event.message.style ?? 'NORMAL',
            },
          ],
          isTyping: false,
        });
        break;
      case 'Typing':
        this.update({ isTyping: event.isTyping });
        break;
      case 'Connection':
        this.update({ isOnline: event.isOnline });
        break;
      case 'FormNotice':
        this.update({
          messages: [
            ...this.state.messages,
            nowMessage(event.message, 'SYSTEM', null, 'CENTERED_NOTICE'),
          ],
        });
        break;
      case 'SessionEnded':
        this.update({
          sessionReady: false,
          sessionEnded: true,
          isOnline: false,
          isTyping: false,
          messages: [
            ...this.state.messages,
            nowMessage('ended the chat', 'SYSTEM'),
          ],
        });
        break;
      case 'Error':
        break;
    }
  }

  private update(partial: Partial<ChatUiState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
