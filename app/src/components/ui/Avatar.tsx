import { drawAvatar } from '@/art/avatars';
import { SkiaIcon } from '@/art/SkiaIcon';

export function Avatar({ id, size = 56, locked }: { id: string; size?: number; locked?: boolean }) {
  return <SkiaIcon cacheKey={`avatar:${id}:${locked ? 1 : 0}`} width={size} draw={(c) => drawAvatar(c, id, size, { locked })} />;
}
