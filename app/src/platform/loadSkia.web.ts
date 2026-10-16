import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

export async function loadSkia(): Promise<void> {
  await LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
}
