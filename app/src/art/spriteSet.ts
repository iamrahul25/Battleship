import { loadData, Skia, type SkImage } from '@shopify/react-native-skia';
import { useSettingsStore } from '@/stores/settings';

/** Whether art should use sprites; anything that caches drawn art must also re-render when this changes. */
export const useImageGraphics = () => useSettingsStore((s) => s.imageGraphics);

/** Images decoded once up front. Art is rasterized into cached icons, so loading must finish before first draw. */
export function spriteSet<K extends string>(sources: Record<K, number>) {
  const images = new Map<K, SkImage>();
  let loading: Promise<void> | null = null;
  return {
    load(): Promise<void> {
      loading ??= Promise.all(
        (Object.entries(sources) as [K, number][]).map(async ([id, source]) => {
          const img = await loadData(source, (data) => Skia.Image.MakeImageFromEncoded(data)).catch(() => null);
          if (img) images.set(id, img);
        }),
      ).then(() => undefined);
      return loading;
    },
    /** Null when the sprite failed to load or image graphics are off, so callers draw the procedural art. */
    get(id: K): SkImage | null {
      if (!useSettingsStore.getState().imageGraphics) return null;
      return images.get(id) ?? null;
    },
  };
}
