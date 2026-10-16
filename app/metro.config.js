// Learn more: https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedDir = path.resolve(projectRoot, '../server/src/shared');

const config = getDefaultConfig(projectRoot);

// The game engine + protocol live once in server/src/shared and are bundled into the app.
config.watchFolders = [...(config.watchFolders ?? []), sharedDir];

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  if (moduleName.startsWith('@shared/')) {
    return resolve(context, path.join(sharedDir, moduleName.slice('@shared/'.length)), platform);
  }
  // Bare imports from shared/ (e.g. `zod`) must resolve from the app's node_modules, not server/'s.
  if (context.originModulePath.startsWith(sharedDir) && !moduleName.startsWith('.') && !path.isAbsolute(moduleName)) {
    return resolve({ ...context, originModulePath: path.join(projectRoot, 'index.ts') }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
