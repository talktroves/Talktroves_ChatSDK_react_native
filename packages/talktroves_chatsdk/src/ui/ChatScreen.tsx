import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChatController, DialogKind } from '../state/ChatController';
import { ChatMessage } from '../domain/types';
import { Colors } from './theme';

type Props = {
  controller: ChatController;
  expanded: boolean;
  onToggleExpanded: () => void;
  onMinimize: () => void;
  onEnded: () => void;
};

function formatTime(date: Date): string {
  try {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    const h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }
}

function useControllerState(controller: ChatController) {
  const [state, setState] = useState(controller.getState());
  useEffect(() => {
    setState(controller.getState());
    return controller.subscribe(() => setState(controller.getState()));
  }, [controller]);
  return state;
}

export function ChatScreen({
  controller,
  expanded,
  onToggleExpanded,
  onMinimize,
  onEnded,
}: Props) {
  const state = useControllerState(controller);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    if (state.messages.length > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [state.messages.length, state.isTyping]);

  return (
    <View
      style={[
        styles.panel,
        expanded ? styles.panelExpanded : styles.panelRounded,
      ]}
    >
      <View style={styles.column}>
        <ChatHeader
          isOnline={state.isOnline}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
          onMinimize={onMinimize}
        />
        <SubHeader />
        <FlatList
          ref={listRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          data={state.messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              onUpdateInfo={() => controller.openDialog('CONTACT')}
            />
          )}
        />
        {state.isTyping ? (
          <Text style={styles.typing}>TalkTroves Bot is typing...</Text>
        ) : null}
        <Composer
          text={state.text}
          attachmentUri={state.attachmentUri}
          onTextChange={(v) => controller.onTextChange(v)}
          onClearAttachment={() => controller.setAttachment(null)}
          onEndChat={() => setConfirmLogout(true)}
          onMore={() => controller.setMenuOpen(!state.menuOpen)}
          onSend={() => controller.send()}
        />
      </View>

      {state.menuOpen ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => controller.setMenuOpen(false)}
          />
          <View style={styles.menu}>
            <MenuItem
              title="Sound"
              trailing={state.soundOn ? 'On' : 'Off'}
              onPress={() => controller.toggleSound()}
            />
            <MenuItem
              title="Email Transcript"
              onPress={() => controller.openDialog('TRANSCRIPT')}
            />
            <MenuItem
              title="Edit Contact detail"
              onPress={() => controller.openDialog('CONTACT')}
            />
            <MenuItem
              title="End Chat"
              onPress={() => {
                controller.setMenuOpen(false);
                setConfirmLogout(true);
              }}
            />
          </View>
        </>
      ) : null}

      <LogoutDialog
        visible={confirmLogout}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          void controller.endChat(onEnded);
        }}
      />

      {state.dialog ? (
        <ContactDialog
          kind={state.dialog}
          initialName={state.user.name ?? ''}
          initialEmail={state.user.email ?? ''}
          saving={state.savingDialog}
          onCancel={() => controller.closeDialog()}
          onSave={(name, email) => {
            if (
              (state.dialog !== 'TRANSCRIPT' && !name.trim()) ||
              !email.trim()
            ) {
              setAlertMessage(
                state.dialog === 'TRANSCRIPT'
                  ? 'Please enter an email.'
                  : 'Please enter name and email.',
              );
              return;
            }
            if (!state.sessionReady) {
              setAlertMessage('Visitor session is not ready yet.');
              return;
            }
            void controller.saveContact(
              name,
              email,
              (savedEmail) => {
                setAlertMessage(`Transcript will be sent to ${savedEmail}`);
              },
              (err) => setAlertMessage(err),
            );
          }}
        />
      ) : null}

      <Modal
        transparent
        visible={alertMessage != null}
        animationType="fade"
        onRequestClose={() => setAlertMessage(null)}
      >
        <View style={styles.alertBackdrop}>
          <View style={styles.alertCard}>
            <Text style={styles.alertText}>{alertMessage}</Text>
            <Pressable onPress={() => setAlertMessage(null)}>
              <Text style={styles.alertOk}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChatHeader({
  isOnline,
  expanded,
  onToggleExpanded,
  onMinimize,
}: {
  isOnline: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onMinimize: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerAvatar}>
        <Text style={styles.headerAvatarGlyph}>☵</Text>
      </View>
      <View style={styles.headerTitles}>
        <Text style={styles.headerTitle}>support</Text>
        <View style={styles.onlineRow}>
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: isOnline ? Colors.Online : Colors.Offline },
            ]}
          />
          <Text style={styles.onlineText}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>
      <Pressable onPress={onToggleExpanded} hitSlop={8}>
        <Text style={styles.headerAction}>{expanded ? '↙' : '□'}</Text>
      </Pressable>
      <Pressable onPress={onMinimize} hitSlop={8} style={{ marginLeft: 18 }}>
        <Text style={styles.headerAction}>−</Text>
      </Pressable>
    </View>
  );
}

function SubHeader() {
  return (
    <>
      <View style={styles.subHeader}>
        <View style={styles.subAvatar}>
          <Text style={styles.subAvatarGlyph}>⌁</Text>
        </View>
        <View>
          <Text style={styles.subTitle}>live support</Text>
          <Text style={styles.subSubtitle}>Ask us anything</Text>
        </View>
      </View>
      <View style={styles.divider} />
    </>
  );
}

function MessageBubble({
  message,
  onUpdateInfo,
}: {
  message: ChatMessage;
  onUpdateInfo: () => void;
}) {
  if (message.sender === 'SYSTEM') {
    if (
      message.style !== 'CENTERED_NOTICE' &&
      !message.content.includes('ended the chat')
    ) {
      return null;
    }
    if (message.style === 'CENTERED_NOTICE') {
      return (
        <View style={styles.noticeWrap}>
          <Text style={styles.noticeText}>{message.content}</Text>
        </View>
      );
    }
    return <Text style={styles.endedText}>{message.content}</Text>;
  }

  if (message.sender === 'USER') {
    const sending = message.status === 'SENDING';
    return (
      <View style={styles.userWrap}>
        <View style={styles.userBubble}>
          {message.attachmentUri ? (
            <Image
              source={{ uri: message.attachmentUri }}
              style={styles.attachmentLarge}
            />
          ) : null}
          <Text style={styles.userText}>{message.content}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaTime}>{formatTime(message.timestamp)}</Text>
          <Text
            style={[
              styles.metaTicks,
              { color: sending ? Colors.TextMuted : Colors.Online },
            ]}
          >
            {sending ? '✓' : '✓✓'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantAvatar}>
        <Text style={styles.assistantAvatarGlyph}>●</Text>
      </View>
      <View style={styles.assistantCol}>
        <Text style={styles.botLabel}>TalkTroves Bot</Text>
        <View style={styles.assistantBubble}>
          <Text style={styles.assistantText}>{message.content}</Text>
        </View>
        <Text style={styles.metaTime}>{formatTime(message.timestamp)}</Text>
        {message.content.includes('Hi! How can I help you today?') ? (
          <Pressable onPress={onUpdateInfo}>
            <Text style={styles.updateInfo}>Please update your info</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Composer({
  text,
  attachmentUri,
  onTextChange,
  onClearAttachment,
  onEndChat,
  onMore,
  onSend,
}: {
  text: string;
  attachmentUri: string | null;
  onTextChange: (v: string) => void;
  onClearAttachment: () => void;
  onEndChat: () => void;
  onMore: () => void;
  onSend: () => void;
}) {
  return (
    <View style={styles.composer}>
      {attachmentUri ? (
        <View style={styles.attachmentPreview}>
          <Image source={{ uri: attachmentUri }} style={styles.attachmentThumb} />
          <Pressable style={styles.clearAttachment} onPress={onClearAttachment}>
            <Text style={styles.clearAttachmentText}>×</Text>
          </Pressable>
        </View>
      ) : null}
      <TextInput
        value={text}
        onChangeText={onTextChange}
        placeholder="Type a message here"
        placeholderTextColor={Colors.TextMuted}
        multiline
        style={styles.input}
      />
      <View style={styles.composerActions}>
        <Pressable onPress={onEndChat} hitSlop={8}>
          <Text style={styles.composerIcon}>⎋</Text>
        </Pressable>
        <Pressable onPress={onMore} hitSlop={8}>
          <Text style={styles.composerMore}>•••</Text>
        </Pressable>
        <Pressable style={styles.sendButton} onPress={onSend}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MenuItem({
  title,
  trailing,
  onPress,
}: {
  title: string;
  trailing?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Text style={styles.menuItemTitle}>{title}</Text>
      {trailing ? <Text style={styles.menuItemTrailing}>{trailing}</Text> : null}
    </Pressable>
  );
}

function LogoutDialog({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>Logout</Text>
          <View style={styles.dialogDivider} />
          <View style={styles.dialogBody}>
            <Text style={styles.dialogMessage}>
              Are you sure you want to end this chat session?
            </Text>
            <View style={styles.dialogActions}>
              <Pressable style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={onConfirm}>
                <Text style={styles.primaryBtnText}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ContactDialog({
  kind,
  initialName,
  initialEmail,
  saving,
  onCancel,
  onSave,
}: {
  kind: DialogKind;
  initialName: string;
  initialEmail: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (name: string, email: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const transcript = kind === 'TRANSCRIPT';

  useEffect(() => {
    setName(initialName);
    setEmail(initialEmail);
  }, [kind, initialName, initialEmail]);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>
            {transcript ? 'Email chat Transcript' : 'Edit contact details'}
          </Text>
          <View style={styles.dialogDivider} />
          <View style={styles.dialogBody}>
            {!transcript ? (
              <>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  editable={!saving}
                  style={styles.field}
                />
              </>
            ) : null}
            <Text style={[styles.fieldLabel, !transcript && { marginTop: 20 }]}>
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              editable={!saving}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.field}
            />
            <View style={styles.dialogActions}>
              <Pressable
                style={styles.cancelBtn}
                disabled={saving}
                onPress={onCancel}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.primaryBtn}
                disabled={saving}
                onPress={() => onSave(name.trim(), email.trim())}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  panelRounded: {
    borderRadius: 24,
  },
  panelExpanded: {
    borderRadius: 0,
  },
  column: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.Blue,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarGlyph: {
    color: '#fff',
    fontSize: 22,
  },
  headerTitles: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginLeft: 6,
  },
  headerAction: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 25,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  subAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  subAvatarGlyph: {
    fontSize: 21,
    color: Colors.TextPrimary,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.TextPrimary,
  },
  subSubtitle: {
    fontSize: 12,
    color: Colors.TextSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
  },
  messageList: {
    flex: 1,
    backgroundColor: Colors.ChatBackground,
  },
  messageListContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  typing: {
    backgroundColor: Colors.ChatBackground,
    color: Colors.TextSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    paddingHorizontal: 24,
    paddingVertical: 4,
  },
  endedText: {
    width: '100%',
    textAlign: 'center',
    color: Colors.TextMuted,
    fontSize: 13,
    paddingVertical: 8,
  },
  noticeWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  noticeText: {
    maxWidth: 300,
    backgroundColor: Colors.NoticeBackground,
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userWrap: {
    alignItems: 'flex-end',
    marginVertical: 6,
  },
  userBubble: {
    maxWidth: 260,
    backgroundColor: Colors.UserBubble,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userText: {
    fontSize: 15,
    color: Colors.UserText,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  metaTime: {
    fontSize: 11,
    color: Colors.TextMuted,
  },
  metaTicks: {
    fontSize: 12,
    marginLeft: 4,
  },
  assistantRow: {
    flexDirection: 'row',
    marginVertical: 6,
  },
  assistantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantAvatarGlyph: {
    color: '#fff',
    fontSize: 18,
  },
  assistantCol: {
    marginLeft: 8,
    maxWidth: 240,
  },
  botLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.TextSecondary,
    marginBottom: 4,
  },
  assistantBubble: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.AssistantBorder,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  assistantText: {
    fontSize: 15,
    color: Colors.TextPrimary,
  },
  updateInfo: {
    color: Colors.Blue,
    fontWeight: '600',
    textDecorationLine: 'underline',
    fontSize: 14,
    marginTop: 12,
    marginHorizontal: 24,
  },
  composer: {
    backgroundColor: '#fff',
    padding: 16,
  },
  attachmentPreview: {
    width: 70,
    height: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginBottom: 12,
    overflow: 'hidden',
  },
  attachmentThumb: {
    width: '100%',
    height: '100%',
  },
  attachmentLarge: {
    width: 210,
    height: 180,
    borderRadius: 12,
    marginBottom: 8,
  },
  clearAttachment: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAttachmentText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 16,
  },
  input: {
    minHeight: 70,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    textAlignVertical: 'top',
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  composerIcon: {
    fontSize: 22,
    color: '#4B5563',
    width: 38,
    textAlign: 'center',
  },
  composerMore: {
    fontSize: 23,
    color: '#4B5563',
    width: 38,
    textAlign: 'center',
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: Colors.Blue,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  sendText: {
    color: '#fff',
    fontWeight: '700',
  },
  menu: {
    position: 'absolute',
    right: 16,
    bottom: 72,
    width: 200,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 16,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  menuItemTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.MenuText,
  },
  menuItemTrailing: {
    fontSize: 14,
    color: Colors.TextSecondary,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.MenuText,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  dialogDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
  },
  dialogBody: {
    padding: 24,
  },
  dialogMessage: {
    fontSize: 15,
    color: '#384A62',
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: Colors.FieldBorder,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  cancelText: {
    fontWeight: '700',
    color: '#384A62',
  },
  primaryBtn: {
    minWidth: 92,
    alignItems: 'center',
    backgroundColor: Colors.Blue,
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#384A62',
    marginBottom: 8,
  },
  field: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.FieldBorder,
    paddingVertical: 8,
    fontSize: 15,
    color: Colors.TextPrimary,
  },
  alertBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  alertText: {
    fontSize: 15,
    color: Colors.TextPrimary,
    marginBottom: 16,
  },
  alertOk: {
    alignSelf: 'flex-end',
    color: Colors.Blue,
    fontWeight: '700',
    fontSize: 15,
  },
});
