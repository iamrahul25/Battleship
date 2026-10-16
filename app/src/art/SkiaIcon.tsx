import { type SkCanvas, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Image, type ImageStyle, PixelRatio, type StyleProp } from 'react-native';

const cache = new Map<string, string>();

/**
 * Rasterizes procedural art once into a PNG data URI. Small icons go through this instead of
 * live <Canvas> elements because each web canvas holds a WebGL context and browsers cap them.
 */
export function renderIcon(cacheKey: string, width: number, height: number, draw: (c: SkCanvas) => void): string | null {
  const scale = Math.min(3, Math.max(2, PixelRatio.get()));
  const k = `${cacheKey}@${width}x${height}@${scale}`;
  const hit = cache.get(k);
  if (hit) return hit;
  try {
    const surface = Skia.Surface.Make(Math.ceil(width * scale), Math.ceil(height * scale));
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.scale(scale, scale);
    draw(canvas);
    surface.flush();
    const uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`;
    cache.set(k, uri);
    return uri;
  } catch {
    return null;
  }
}

interface Props {
  cacheKey: string;
  width: number;
  height?: number;
  draw: (c: SkCanvas) => void;
  style?: StyleProp<ImageStyle>;
}

export function SkiaIcon({ cacheKey, width, height = width, draw, style }: Props) {
  // `draw` is keyed by cacheKey; callers pass a stable key per visual variant.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const uri = useMemo(() => renderIcon(cacheKey, width, height, draw), [cacheKey, width, height]);
  if (!uri) return null;
  return <Image source={{ uri }} style={[{ width, height }, style]} />;
}
