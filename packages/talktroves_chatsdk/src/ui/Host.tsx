import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { TalktrovesChatSDKConfig } from '../api/config';
import { VisitorChatService } from '../data/VisitorChatService';
import { ChatController } from '../state/ChatController';
import { ChatScreen } from './ChatScreen';
import { Colors } from './theme';

type HostProps = {
  config: TalktrovesChatSDKConfig;
  initiallyVisible?: boolean;
  style?: StyleProp<ViewStyle>;
};

type SessionBundle = {
  service: VisitorChatService;
  controller: ChatController;
  instance: number;
};

/**
 * Floating Support button + chat panel.
 */
export function Host({
  config,
  initiallyVisible = false,
  style,
}: HostProps) {
  const { width: maxW, height: maxH } = useWindowDimensions();
  const [chatCreated, setChatCreated] = useState(initiallyVisible);
  const [chatVisible, setChatVisible] = useState(initiallyVisible);
  const [expanded, setExpanded] = useState(false);
  const [chatInstance, setChatInstance] = useState(0);
  const [newSessionNextOpen, setNewSessionNextOpen] = useState(false);
  const [session, setSession] = useState<SessionBundle | null>(null);
  const sessionRef = useRef<SessionBundle | null>(null);
  const skipConfigReset = useRef(true);

  const configKey = useMemo(
    () =>
      JSON.stringify({
        baseUrl: config.baseUrl,
        tenantId: config.tenantId,
        sessionId: config.sessionId,
        domain: config.domain,
        enableSocket: config.enableSocket,
        pollingIntervalMs: config.pollingIntervalMs,
        title: config.title,
        url: config.url,
        tz: config.tz,
        reconnect: config.reconnect,
      }),
    [config],
  );

  const disposeBundle = (bundle: SessionBundle | null) => {
    if (!bundle) return;
    bundle.controller.dispose();
    bundle.service.dispose();
  };

  useEffect(() => {
    return () => {
      disposeBundle(sessionRef.current);
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (skipConfigReset.current) {
      skipConfigReset.current = false;
      return;
    }
    disposeBundle(sessionRef.current);
    sessionRef.current = null;
    setSession(null);
    setChatInstance((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  useEffect(() => {
    if (!chatCreated || !chatVisible) return;

    setSession((prev) => {
      if (prev && prev.instance === chatInstance) {
        sessionRef.current = prev;
        return prev;
      }
      disposeBundle(prev);
      const service = new VisitorChatService(config);
      const controller = new ChatController(service);
      const next = { service, controller, instance: chatInstance };
      sessionRef.current = next;
      return next;
    });
  }, [chatCreated, chatVisible, chatInstance, configKey, config]);

  const chatWidth = Math.min(380, maxW - 32);
  const chatHeight = Math.min(600, maxH - 48);
  const left = (maxW - chatWidth) / 2;
  const top = (maxH - chatHeight) / 2;

  const openChat = () => {
    if (newSessionNextOpen) {
      disposeBundle(sessionRef.current);
      sessionRef.current = null;
      setSession(null);
      setChatInstance((n) => n + 1);
      setNewSessionNextOpen(false);
    }
    setChatCreated(true);
    setChatVisible(true);
  };

  return (
    <View style={[styles.root, style]} pointerEvents="box-none">
      {chatCreated && chatVisible && session ? (
        <View
          style={
            expanded
              ? styles.expandedPanel
              : [
                  styles.collapsedPanel,
                  {
                    width: chatWidth,
                    height: chatHeight,
                    left,
                    top,
                  },
                ]
          }
          pointerEvents="box-none"
        >
          <ChatScreen
            controller={session.controller}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((v) => !v)}
            onMinimize={() => setChatVisible(false)}
            onEnded={() => {
              setChatVisible(false);
              setExpanded(false);
              setNewSessionNextOpen(true);
            }}
          />
        </View>
      ) : null}

      {!chatVisible ? (
        <Pressable style={styles.launcher} onPress={openChat}>
          <Text style={styles.launcherGlyph}>◌</Text>
          <Text style={styles.launcherText}>Support</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  expandedPanel: {
    ...StyleSheet.absoluteFillObject,
  },
  collapsedPanel: {
    position: 'absolute',
  },
  launcher: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.Blue,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  launcherGlyph: {
    color: '#fff',
    fontSize: 25,
    marginRight: 9,
  },
  launcherText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
