import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  TalktrovesChatSDKConfig,
  TalkTrovesDemoConfig,
  resolveConfig,
} from './api/config';
import { VisitorChatService } from './data/VisitorChatService';
import { Host as HostComponent } from './ui/Host';

let activeConfig: TalktrovesChatSDKConfig | null = null;

export type HostProps = {
  config?: TalktrovesChatSDKConfig;
  initiallyVisible?: boolean;
  style?: StyleProp<ViewStyle>;
};

function TalktrovesHost({
  config,
  initiallyVisible,
  style,
}: HostProps): React.ReactElement {
  const resolved = config ?? TalktrovesChatSDK.requireConfig();
  return (
    <HostComponent
      config={resolved}
      initiallyVisible={initiallyVisible}
      style={style}
    />
  );
}

/**
 * Public entry point for the Talktroves Chat SDK (React Native).
 *
 * Typical usage:
 *
 * ```ts
 * TalktrovesChatSDK.init({ baseUrl: '...', tenantId: '...' });
 *
 * // In root UI:
 * <>
 *   <App />
 *   <TalktrovesChatSDK.Host />
 * </>
 * ```
 */
export const TalktrovesChatSDK = {
  /** Stores configuration used by Host. Call once at app startup. */
  init(config: TalktrovesChatSDKConfig): void {
    resolveConfig(config);
    activeConfig = config;
  },

  /** Returns the active config, or throws if init was not called. */
  requireConfig(): TalktrovesChatSDKConfig {
    if (!activeConfig) {
      throw new Error('TalktrovesChatSDK.init(config) must be called before use.');
    }
    return activeConfig;
  },

  /** Optional: create a headless service for custom UI integrations. */
  createService(
    config: TalktrovesChatSDKConfig = TalktrovesChatSDK.requireConfig(),
  ): VisitorChatService {
    return new VisitorChatService(config);
  },

  /**
   * Floating Support button and chat panel.
   */
  Host: TalktrovesHost,

  /** Convenience demo configuration (public tenant, no secrets). */
  demoConfig(): TalktrovesChatSDKConfig {
    return { ...TalkTrovesDemoConfig };
  },
};
