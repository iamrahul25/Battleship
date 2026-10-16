import { Fill, Rect, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { colors } from '@/theme';

const source = Skia.RuntimeEffect.Make(`
uniform float t;
uniform float2 res;
uniform float tone;

half4 main(float2 p) {
  float2 uv = p / res;
  float w1 = sin(uv.x * 9.0 + t * 0.8 + sin(uv.y * 5.0 + t * 0.3));
  float w2 = sin(uv.y * 12.0 - t * 0.6 + sin(uv.x * 7.0 - t * 0.4));
  float wave = (w1 + w2) * 0.25;
  float c1 = sin((uv.x * 1.3 + uv.y) * 24.0 + t * 1.1 + wave * 3.0);
  float c2 = sin((uv.x - uv.y * 1.2) * 19.0 - t * 0.9 + wave * 2.0);
  float caustic = smoothstep(0.75, 1.0, c1 * c2) * 0.22;
  float3 deep = float3(0.055, 0.17, 0.30);
  float3 shallow = float3(0.118, 0.353, 0.541);
  float3 col = mix(deep, shallow, clamp(0.5 + wave * 0.6 - uv.y * 0.15, 0.0, 1.0));
  col = mix(col, col * 0.62, tone);
  col += float3(0.31, 0.64, 0.85) * caustic * (1.0 - tone * 0.5);
  return half4(half3(col), 1.0);
}
`);

/** Animated ocean (Skia runtime shader). `tone` 1 darkens it for the player's own waters. */
export function Water({ width, height, tone = 0, animate = true }: { width: number; height: number; tone?: number; animate?: boolean }) {
  const clock = useClock();
  const uniforms = useDerivedValue(() => ({ t: animate ? clock.value / 1000 : 0, res: [width, height], tone }));
  if (!source) return <Rect x={0} y={0} width={width} height={height} color={colors.ocean500} />;
  return (
    <Fill>
      <Shader source={source} uniforms={uniforms} />
    </Fill>
  );
}
