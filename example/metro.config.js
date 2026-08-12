const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const sdkRoot = path.resolve(workspaceRoot, 'packages/talktroves_chatsdk');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sdkRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(sdkRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  'talktroves_chatsdk': sdkRoot,
};

module.exports = config;
