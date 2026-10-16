import {
  BlurStyle,
  PaintStyle,
  type SkCanvas,
  Skia,
  type SkPaint,
  type SkPath,
  StrokeCap,
  StrokeJoin,
  TileMode,
  vec,
} from '@shopify/react-native-skia';

export interface PaintOptions {
  stroke?: number;
  alpha?: number;
  blur?: number;
  cap?: 'round' | 'butt' | 'square';
}

export function paint(color: string, opts: PaintOptions = {}): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  if (opts.stroke !== undefined) {
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(opts.stroke);
    p.setStrokeJoin(StrokeJoin.Round);
  }
  if (opts.cap) p.setStrokeCap(opts.cap === 'round' ? StrokeCap.Round : opts.cap === 'square' ? StrokeCap.Square : StrokeCap.Butt);
  if (opts.alpha !== undefined) p.setAlphaf(opts.alpha);
  if (opts.blur) p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, opts.blur, true));
  return p;
}

export function linear(x0: number, y0: number, x1: number, y1: number, colors: string[], pos: number[] | null = null): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setShader(Skia.Shader.MakeLinearGradient(vec(x0, y0), vec(x1, y1), colors.map((c) => Skia.Color(c)), pos, TileMode.Clamp));
  return p;
}

export function radial(cx: number, cy: number, r: number, colors: string[], pos: number[] | null = null): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setShader(Skia.Shader.MakeRadialGradient(vec(cx, cy), r, colors.map((c) => Skia.Color(c)), pos, TileMode.Clamp));
  return p;
}

export function svg(d: string): SkPath {
  return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
}

export function poly(points: [number, number][], close = true): SkPath {
  const b = Skia.PathBuilder.Make();
  points.forEach(([x, y], i) => (i === 0 ? b.moveTo(x, y) : b.lineTo(x, y)));
  if (close) b.close();
  return b.detach();
}

export const rect = (x: number, y: number, w: number, h: number) => Skia.XYWHRect(x, y, w, h);
export const rrect = (x: number, y: number, w: number, h: number, r: number) => Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);

export function star(cx: number, cy: number, outer: number, inner: number, points = 5): SkPath {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(pts);
}

/** Records drawing commands into a picture that live <Canvas> trees can render with <Picture>. */
export function record(width: number, height: number, draw: (c: SkCanvas) => void) {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
  draw(canvas);
  return recorder.finishRecordingAsPicture();
}
