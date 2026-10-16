// `@expo/metro-runtime` must be the first import for Fast Refresh on web.
import '@expo/metro-runtime';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { loadSkia } from './src/platform/loadSkia';

// On web, Skia's CanvasKit (WASM) must be loaded before anything renders.
loadSkia().then(() => renderRootComponent(App));
