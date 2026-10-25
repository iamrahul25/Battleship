import {
  type Action,
  applyAction,
  type Bot,
  botViewFromPublic,
  BOT_PROFILES,
  type Coord,
  createBot,
  createGame,
  createRng,
  DEFAULT_BOARD_SIZE,
  type Difficulty,
  type GameMode,
  type GameState,
  getPublicView,
  matchRules,
  type ObstacleLevel,
  ONLINE_TURN_TIME_MS,
  type Orientation,
  type PlacedShip,
  type PublicView,
  randomSeed,
  type Rng,
  type RuleSet,
} from '@shared/engine';
import { ERROR_MESSAGES, type EmoteId } from '@shared/protocol';
import { type ControllerMeta, Emitter, type GameController, type PlayerCardInfo } from './types';

const HUMAN = 0 as const;
const BOT = 1 as const;
/** Extra wait so the bot fires after the previous shot's animation has played. */
const FX_ALLOWANCE_MS = 900;

export interface LocalGameOptions {
  difficulty: Difficulty;
  mode: GameMode;
  bonusShotOnHit: boolean;
  allowTouching: boolean;
  offlineTimer: boolean;
  /** Square board edge (defaults to Medium). */
  boardSize?: number;
  obstacles?: ObstacleLevel;
  me: PlayerCardInfo;
  seed?: number;
}

export interface SavedLocalGame {
  version: 1;
  options: LocalGameOptions;
  state: GameState;
  botRngState: number;
  savedAt: number;
}

export class LocalGameController implements GameController {
  readonly kind = 'bot' as const;
  readonly mode: GameMode;
  readonly rules: RuleSet;
  readonly difficulty: Difficulty;

  private state: GameState;
  private rng: Rng;
  private bot: Bot;
  private emitter = new Emitter();
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private deadline: number | null = null;
  private pausedRemaining: number | null = null;
  private paused = false;
  private disposed = false;

  constructor(
    readonly options: LocalGameOptions,
    saved?: SavedLocalGame,
  ) {
    this.mode = options.mode;
    this.difficulty = options.difficulty;
    this.rules = saved
      ? saved.state.rules
      : matchRules(
          options.mode,
          { boardSize: options.boardSize ?? DEFAULT_BOARD_SIZE, obstacles: options.obstacles ?? 'none' },
          {
            bonusShotOnHit: options.bonusShotOnHit,
            allowTouching: options.allowTouching,
            turnTimeMs: options.offlineTimer ? ONLINE_TURN_TIME_MS : null,
          },
        );
    this.rng = createRng(saved ? saved.botRngState : (options.seed ?? randomSeed()));
    this.bot = createBot(options.difficulty, this.rules, this.rng);
    this.state = saved ? saved.state : this.freshGame();
    if (saved) this.schedule();
  }

  static fromSave(saved: SavedLocalGame) {
    return new LocalGameController(saved.options, saved);
  }

  private freshGame(): GameState {
    let state = createGame(this.rules, this.rng.next() * 0xffffffff);
    state = applyAction(state, { type: 'PLACE_FLEET', player: BOT, ships: this.bot.placeFleet(state.players[BOT].board.obstacles) }).state;
    state = applyAction(state, { type: 'READY', player: BOT }).state;
    return state;
  }

  serialize(): SavedLocalGame | null {
    if (this.state.phase !== 'battle') return null;
    return { version: 1, options: this.options, state: this.state, botRngState: this.rng.state, savedAt: Date.now() };
  }

  getState() {
    return this.state;
  }

  getView(): PublicView {
    return getPublicView(this.state, HUMAN);
  }

  getMeta(): ControllerMeta {
    const profile = BOT_PROFILES[this.difficulty];
    return {
      phase: this.state.phase,
      me: this.options.me,
      opponent: { name: profile.name, avatarId: profile.avatarId, wins: 0, losses: 0, connected: true, isBot: true },
      deadline: this.paused ? null : this.deadline,
      paused: this.paused,
      connection: 'connected',
      opponentReconnectDeadline: null,
      rematch: { me: false, opponent: false },
    };
  }

  subscribe(listener: Parameters<GameController['subscribe']>[0]) {
    return this.emitter.subscribe(listener);
  }

  placeFleet(ships: PlacedShip[], mines?: Coord[]) {
    this.dispatch({ type: 'PLACE_FLEET', player: HUMAN, ships, mines });
  }

  ready() {
    this.dispatch({ type: 'READY', player: HUMAN });
  }

  fire(target: Coord) {
    this.dispatch({ type: 'FIRE', player: HUMAN, target });
  }

  useWeapon(weaponId: string, target: Coord, orientation?: Orientation) {
    this.dispatch({ type: 'USE_WEAPON', player: HUMAN, weaponId, target, orientation });
  }

  forfeit() {
    this.dispatch({ type: 'FORFEIT', player: HUMAN });
  }

  rematch() {
    this.clearTimers();
    this.state = this.freshGame();
    this.emitter.emit({ type: 'view', view: this.getView() });
    this.emitMeta();
  }

  emote(_id: EmoteId) {
    // Bots don't chat.
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.pausedRemaining = this.deadline ? Math.max(1000, this.deadline - Date.now()) : null;
    this.clearTimers();
    this.emitMeta();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.schedule(this.pausedRemaining ?? undefined);
    this.pausedRemaining = null;
    this.emitMeta();
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
    this.emitter.clear();
  }

  private dispatch(action: Action) {
    if (this.disposed) return;
    const res = applyAction(this.state, action);
    if (res.error) {
      this.emitter.emit({ type: 'error', code: res.error, message: ERROR_MESSAGES[res.error] ?? res.error });
      return;
    }
    this.state = res.state;

    let shot = false;
    for (const ev of res.events) {
      if (ev.type === 'shot') {
        shot = true;
        this.emitter.emit({ type: 'shot', event: ev.shot, view: this.getView() });
      } else if (ev.type === 'gameOver') {
        this.clearTimers();
        this.deadline = null;
        this.emitter.emit({
          type: 'gameOver',
          youWon: ev.winner === HUMAN,
          reason: ev.reason,
          view: this.getView(),
          revealFleet: this.state.players[BOT].board.ships,
        });
      }
    }
    if (!shot) this.emitter.emit({ type: 'view', view: this.getView() });
    this.schedule();
    this.emitMeta();
  }

  private schedule(humanTimeMs?: number) {
    this.clearTimers();
    this.deadline = null;
    if (this.paused || this.disposed || this.state.phase !== 'battle') return;

    if (this.state.activePlayer === BOT) {
      this.botTimer = setTimeout(() => this.botMove(), this.bot.thinkDelayMs() + FX_ALLOWANCE_MS);
      return;
    }
    if (this.rules.turnTimeMs) {
      const ms = humanTimeMs ?? this.rules.turnTimeMs + FX_ALLOWANCE_MS;
      this.deadline = Date.now() + ms;
      this.turnTimer = setTimeout(() => this.dispatch({ type: 'TIMEOUT', player: HUMAN }), ms);
    }
  }

  private botMove() {
    this.botTimer = null;
    if (this.state.phase !== 'battle' || this.state.activePlayer !== BOT) return;
    const choice = this.bot.chooseAction(botViewFromPublic(getPublicView(this.state, BOT)));
    if (choice.type === 'FIRE') this.dispatch({ type: 'FIRE', player: BOT, target: choice.target });
    else this.dispatch({ type: 'USE_WEAPON', player: BOT, weaponId: choice.weaponId, target: choice.target, orientation: choice.orientation });
  }

  private clearTimers() {
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.botTimer = null;
    this.turnTimer = null;
  }

  private emitMeta() {
    this.emitter.emit({ type: 'meta', meta: this.getMeta() });
  }
}
