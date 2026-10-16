import { readJson, removeKey, writeJson } from '@/platform/storage';
import type { SavedLocalGame } from './controllers/LocalGameController';

const KEY = 'savedGame.v1';

export const loadSavedGame = async () => {
  const saved = await readJson<SavedLocalGame>(KEY);
  return saved?.version === 1 && saved.state?.phase === 'battle' ? saved : null;
};

export const saveGame = (game: SavedLocalGame) => writeJson(KEY, game);
export const clearSavedGame = () => removeKey(KEY);
