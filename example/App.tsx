import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { TalktrovesChatSDK, TalktrovesChatSDKColors } from 'talktroves_chatsdk';

TalktrovesChatSDK.init(TalktrovesChatSDK.demoConfig());

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Talktroves_ChatSDK Demo</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.hint}>
            Tap the chat button to open live support.
          </Text>
        </View>
      </SafeAreaView>
      <TalktrovesChatSDK.Host />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: TalktrovesChatSDKColors.ScreenBackground,
  },
  safe: {
    flex: 1,
  },
  header: {
    height: 56,
    backgroundColor: TalktrovesChatSDKColors.Blue,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  hint: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'center',
  },
});
