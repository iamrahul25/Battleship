import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { AppState } from 'react-native';
import { useSettingsStore } from '@/stores/settings';

const SFX = {
  click: require('../../assets/sounds/click.wav'),
  pickup: require('../../assets/sounds/pickup.wav'),
  drop: require('../../assets/sounds/drop.wav'),
  rotate: require('../../assets/sounds/rotate.wav'),
  invalid: require('../../assets/sounds/invalid.wav'),
  ready: require('../../assets/sounds/ready.wav'),
  fire: require('../../assets/sounds/fire.wav'),
  miss: require('../../assets/sounds/miss.wav'),
  hit: require('../../assets/sounds/hit.wav'),
  sunk: require('../../assets/sounds/sunk.wav'),
  artillery: require('../../assets/sounds/artillery.wav'),
  sonar: require('../../assets/sounds/sonar.wav'),
  turn: require('../../assets/sounds/turn.wav'),
  tick: require('../../assets/sounds/tick.wav'),
  victory: require('../../assets/sounds/victory.wav'),
  defeat: require('../../assets/sounds/defeat.wav'),
  badge: require('../../assets/sounds/badge.wav'),
  found: require('../../assets/sounds/found.wav'),
} as const;

const MUSIC = {
  menu: require('../../assets/music/menu.wav'),
  battle: require('../../assets/music/battle.wav'),
} as const;

export type SoundId = keyof typeof SFX;
export type MusicId = keyof typeof MUSIC;

/** Sounds that commonly overlap (artillery salvos, rapid shots) get several voices. */
const POOL_SIZE: Partial<Record<SoundId, number>> = { hit: 3, miss: 3, sunk: 2, fire: 2, click: 2 };

class SoundManagerImpl {
  private pools = new Map<SoundId, AudioPlayer[]>();
  private cursor = new Map<SoundId, number>();
  private music = new Map<MusicId, AudioPlayer>();
  private wantedMusic: MusicId | null = null;
  private playingMusic: MusicId | null = null;
  private intense = false;
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(
      () => undefined,
    );
    for (const id of Object.keys(SFX) as SoundId[]) {
      const voices = Array.from({ length: POOL_SIZE[id] ?? 1 }, () => this.safeCreate(SFX[id]));
      this.pools.set(
        id,
        voices.filter((v): v is AudioPlayer => v !== null),
      );
    }
    for (const id of Object.keys(MUSIC) as MusicId[]) {
      const p = this.safeCreate(MUSIC[id]);
      if (p) {
        p.loop = true;
        this.music.set(id, p);
      }
    }
    AppState.addEventListener('change', (s) => {
      if (s === 'active') this.applyMusic();
      else this.stopMusicPlayback();
    });
    useSettingsStore.subscribe((s, prev) => {
      if (s.musicVolume !== prev.musicVolume) this.applyMusic();
    });
  }

  private safeCreate(source: number): AudioPlayer | null {
    try {
      return createAudioPlayer(source);
    } catch {
      return null;
    }
  }

  play(id: SoundId, volumeScale = 1) {
    const volume = useSettingsStore.getState().soundVolume * volumeScale;
    // Browsers block audio until the first gesture; a UI sound is a good moment to retry music.
    if (this.wantedMusic && this.playingMusic !== this.wantedMusic) this.applyMusic();
    if (volume <= 0) return;
    const pool = this.pools.get(id);
    if (!pool?.length) return;
    const i = this.cursor.get(id) ?? 0;
    this.cursor.set(id, (i + 1) % pool.length);
    const player = pool[i];
    try {
      player.volume = Math.min(1, volume);
      player.seekTo(0).catch(() => undefined);
      player.play();
    } catch {
      // Audio is non-critical.
    }
  }

  playMusic(id: MusicId | null) {
    this.wantedMusic = id;
    if (id !== 'battle') this.intense = false;
    this.applyMusic();
  }

  /** Battle "intensity layer": faster, louder loop when either side is down to one ship. */
  setIntensity(high: boolean) {
    if (this.intense === high) return;
    this.intense = high;
    this.applyMusic();
  }

  private applyMusic() {
    const volume = useSettingsStore.getState().musicVolume;
    for (const [id, player] of this.music) {
      if (id !== this.wantedMusic || volume <= 0) {
        if (this.playingMusic === id) {
          try {
            player.pause();
          } catch {
            // ignore
          }
          this.playingMusic = null;
        }
        continue;
      }
      try {
        player.volume = Math.min(1, volume * (this.intense ? 1.25 : 0.9));
        player.playbackRate = this.intense ? 1.12 : 1;
        if (this.playingMusic !== id) {
          player.play();
          this.playingMusic = id;
        }
      } catch {
        // ignore
      }
    }
  }

  private stopMusicPlayback() {
    for (const player of this.music.values()) {
      try {
        player.pause();
      } catch {
        // ignore
      }
    }
    this.playingMusic = null;
  }
}

export const SoundManager = new SoundManagerImpl();
export const playSound = (id: SoundId, volumeScale?: number) => SoundManager.play(id, volumeScale);
