import type { SealEndingRecord, SealPlaying, SealReplay, SealReplayEvent, SealReplaySegment, SealTrialLast, TrueBossLast, TrueBossPhase } from '../types'
import type { Adventurer, Animal, AwayReport, Buff, BusyMark, Calendar, CodexState, Drop, ExpeditionLunch, ExpeditionTrip, FarmLast, FarmPlot, FarmState, FeatureId, GoldMineState, Item, JobId, MineBossFight, MineCell, MineFloorRecord, MineHaul, MineState, Mission, Missions, Pet, PetEgg, PetForm, PetSpecies, PetsState, PsychicProc, PsychicState, SaveData, SealState, Settings, ShareMoment, ShopState, SlotId, TimeLease } from '../types'
import { BUFF_KINDS, BUFF_MAX_CHARGES, SAVE_BUFF_LIMIT } from './buffs'
import { heroStats } from './battle'
import { GOODS, emptyShop } from './shop'
import { DISH_IDS, MOB_IDS, ORE_IDS, backfillCodex, emptyCodex } from './codex'
import { FRAY_MAX, emptySeal, replayDurationMs } from './seal'
import { BAG_CAP, FEATURES, READY, emptyCalendar } from './calendar'
import { ANIMALS, CROP_IDS, DECOR, EXPANSIONS, FARM_PLOTS, GREENHOUSE_PLOTS, QUALITIES, SIGN_NAMES, cropOf, emptyFarm, recipeOf } from './farm'
import { CART_BOOST_MS, MAX_LINES, MAX_UPGRADE, WORK_SPAN_LIMIT, emptyGoldMine } from './goldmine'
import { CELLS, DIARY_COUNT, EVENTS, FOSSIL_COUNT, MAX_PICKAXE, MINE_KINDS, emptyMine, hpOf, isBossFloor } from './mine'
import { ACHIEVEMENT_IDS, COUNT_CAP, DAILY_COUNT, MISSION_KINDS, WEEKLY_COUNT, emptyMissions } from './missions'
import { BALANCE, EVOLUTION, LAMP, LEVEL, SAVE_FILES, TRAVEL } from './config'
import { ADVENTURER_IDS, EXPEDITION_HOURS, emptyExpedition } from './expedition'
import { BOSS_GEAR_IDS, NAME_VARIANTS, RARITY_COUNT, SET_IDS, SLOTS } from './gear'
import { PET_NAMES, PET_SPECIES, emptyPets, petExpToNext } from './pets'
import { emptyBlackMarket, emptyPremium } from './premium'
import { emptyPsychic, PSYCHIC_NODE_IDS } from './psychic'
import { T } from './texts'
import { ADVANCED_JOBS, BOSS_STAGE, CHAPTER_COUNT, JOB_IDS, MAX_GROUP } from './world'

// セーブデータ: 版番号つきで $.store の 1 つのキーに保存する。
// 形を変えるときは SAVE_VERSION を上げ、MIGRATIONS に「前の版 → 次の版」の変換を足す。

export const SAVE_KEY = 'save'
export const SAVE_VERSION = 29
export const EXPORT_TAG = 'debug-legend-save'
/** 書いた変更の印をいくつまで残すか */
export const APPLIED_LIMIT = 64
/** store 全体の 4 MiB のうち、実機の記録などにも場所を残す。大きいセーブは削らずに止める */
export const SAVE_MAX_BYTES = 3 * 1024 * 1024

export function checkSaveSize(value: unknown): void {
  let text: string | undefined
  try {
    text = JSON.stringify(value)
  } catch {
    throw new SaveFormatError(T.saveError.shape)
  }
  if (text === undefined) throw new SaveFormatError(T.saveError.shape)
  let bytes = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; i += 1 }
    else bytes += 3
    if (bytes > SAVE_MAX_BYTES) throw new SaveFormatError(T.saveError.capacity(SAVE_MAX_BYTES))
  }
}

/** このバージョンの mod より新しいセーブ（読むと壊すので触らない） */
export class SaveTooNewError extends Error {
  constructor(readonly version: number) {
    super(T.saveError.tooNew(version, SAVE_VERSION))
  }
}

export class SaveFormatError extends Error {}

/** 設定の初期値（BGM・効果音ともオン、通知はエピック以上とボス撃破） */
export const DEFAULT_SETTINGS: Settings = {
  judgeMode: 'equip',
  manualFrom: -1,
  stashFrom: -1,
  curseManual: true,
  autoLamp: false,
  notifyEpic: true,
  notifyBoss: true,
  bgmVolume: 5,
  seVolume: 7,
  isMuted: false,
  windowsSound: false,
  isBandFolded: false,
  language: 'auto',
  debugLog: true,
  notifyUnlock: true,
}

const emptyEquipment = (): Record<SlotId, Item | null> => ({ weapon: null, head: null, body: null, arms: null, legs: null, charm: null })

export function newSave(now: number): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastTickAt: now,
    settledTickAt: now,
    level: 1,
    exp: 0,
    gold: 0,
    goldFraction: 0,
    lamps: 0,
    bonusFraction: 0,
    stage: { chapter: 1, stage: 1, kills: 0, bossTime: 0 },
    daily: { day: '', turnLamps: 0, toolGold: 0, tokenBonus: 0 },
    totals: { turns: 0, toolCalls: 0, tokens: 0, offlineMs: 0, drops: 0 },
    equipment: emptyEquipment(),
    stash: [],
    smith: { zeal: 0, points: 0, guardWeek: '' },
    pending: null,
    lastDrop: null,
    // 乱数の種は作った時刻から（セーブごとに違うドロップになる）
    rng: now >>> 0,
    nextItemId: 1,
    settings: DEFAULT_SETTINGS,
    job: 'novice',
    evolution: 0,
    jobChangedAt: null,
    battleSeconds: 0,
    boss: { retryAt: null, last: null },
    isCleared: false,
    away: null,
    share: null,
    clock: null,
    busy: [],
    applied: [],
    calendar: emptyCalendar(),
    bag: {},
    dishes: [],
    wallet: { stars: 0, psi: 0 },
    titles: { owned: [], current: null },
    shop: emptyShop(),
    buffs: [],
    missions: emptyMissions(),
    mine: emptyMine(),
    farm: emptyFarm(),
    pets: emptyPets(),
    expedition: emptyExpedition(),
    premium: emptyPremium(),
    blackMarket: emptyBlackMarket(),
    psychic: emptyPsychic(),
    beatenBosses: [],
    goldMine: emptyGoldMine(),
    codex: emptyCodex(),
    souls: [],
    seal: emptySeal(),
    hard: { loop: 0 },
  }
}

type Raw = Record<string, unknown>

/**
 * 版ごとの変換。キーは変換「前」の版。
 * 版 0 は版番号を持つ前の試作データ（level / lamps などが直に入っているだけ）。
 */
const MIGRATIONS: Record<number, (old: Raw, now: number) => Raw> = {
  0: (old, now) => ({ ...newSave(now), ...old, version: 1 }),
  // 版 2（M2）: 装備・ランプの結果・乱数・設定を足す
  1: (old, now) => {
    const fresh = newSave(now)
    const totals = isObject(old.totals) ? old.totals : {}
    return { ...old, version: 2, totals: { ...totals, drops: 0 }, equipment: fresh.equipment, pending: null, lastDrop: null, rng: fresh.rng, nextItemId: 1, settings: fresh.settings }
  },
  // 版 3（M3）: ステージが「進行ポイント」から「倒した数」になった。章とステージはそのまま、ステージの途中からやり直し。職・ボス戦を足す
  2: old => {
    const stage = isObject(old.stage) ? old.stage : {}
    return { ...old, version: 3, stage: { chapter: stage.chapter, stage: stage.stage, kills: 0, bossTime: 0 }, job: 'novice', battleSeconds: 0, boss: { retryAt: null, last: null }, isCleared: false, away: null }
  },
  // 版 4（M4）: 設定に通知・音量・ミュート・帯の折りたたみ、X にポストできるできごと（足りない設定は初期値になる）
  3: old => ({ ...old, version: 4, share: null }),
  // 版 5（ベータ 1 回目）: 転職と進化を分けた。職はそのまま、進化は 0 段目から（転職しても強くならなくなった）
  4: old => ({ ...old, version: 5, evolution: 0, jobChangedAt: null }),
  // 版 6: 1 ステージ = 1 つの群れ（1〜3 匹）になった。倒した数は群れの数で数えるので、ステージの最初から（ボス戦の途中はそのまま）
  5: old => {
    const stage = isObject(old.stage) ? old.stage : {}
    return { ...old, version: 6, stage: { ...stage, kills: 0 } }
  },
  // 版 7（1.0.2）: 時間を進める役と、作業中の印（セッションみんなで 1 つのセーブを使う）。
  // 版を上げたので、1.0.1 までのコード（役を知らない）はこのセーブを読まずに止まり、書かなくなる
  6: old => ({ ...old, version: 7, clock: null, busy: [] }),
  // 版 8（1.0.3）: 書いた変更の印（違うプロセスが同時に書いて消えた変更を、入れ直すため）。
  // 1.0.2 のコードは印を知らずに消してしまい、入れ直しが二重になるので、版を上げてこのセーブを読まずに止まってもらう
  7: old => ({ ...old, version: 8, applied: [] }),
  // 版 9（1.0.4）: 群れと群れのあいだの移動（stage.travel）。1.0.3 のコードは移動を消してしまうので、版を上げて止まってもらう
  8: old => ({ ...old, version: 9 }),
  // 版 10（1.1.0）: 毎日の冒険（docs/DAILY.md）。暦・持ち物・星のかけら・称号。この版を入れた日の最初の回答が 1 日目。
  // すでに第 3 章より先にいたら「先輩」（商店のおまけ）。1.0.x のコードはこれらを消してしまうので、版を上げて止まってもらう
  9: old => {
    const stage = isObject(old.stage) ? old.stage : {}
    const veteran = typeof stage.chapter === 'number' && stage.chapter >= 3
    return { ...old, version: 10, calendar: { ...emptyCalendar(), isVeteran: veteran }, bag: {}, wallet: { stars: 0, psi: 0 }, titles: { owned: [], current: null } }
  },
  // 版 11（1.2.0）: 商店と薬（バフ）。1.1.0 のコードは消してしまうので、版を上げて止まってもらう
  10: old => ({ ...old, version: 11, shop: emptyShop(), buffs: [] }),
  // 版 12（1.2.1）: 日課・週課・実績。1.2.0 のコードは消してしまうので、版を上げて止まってもらう
  11: old => ({ ...old, version: 12, missions: emptyMissions() }),
  // 版 13（1.3.0）: 鉱山。1.2.1 のコードは消してしまうので、版を上げて止まってもらう
  12: old => ({ ...old, version: 13, mine: emptyMine() }),
  // 版 14（1.4.0）: 農場・台所。1.3.0 のコードは農場を知らずに消してしまうので、版を上げて止まってもらう
  13: old => ({ ...old, version: 14, farm: isObject(old.farm) ? old.farm : emptyFarm() }),
  // 版 15（1.5.0）: 仲間と遠征。1.4.0 のコードはこれらを知らずに消してしまうので、版を上げて止まってもらう
  14: old => ({ ...old, version: 15, pets: isObject(old.pets) ? old.pets : emptyPets(), expedition: isObject(old.expedition) ? old.expedition : emptyExpedition() }),
  // 版 16（1.6.0）: 鍛冶屋・装備倉庫・装備強化。
  15: old => ({ ...old, version: 16, stash: Array.isArray(old.stash) ? old.stash : [], smith: isObject(old.smith) ? old.smith : { zeal: 0, points: 0, guardWeek: '' } }),
  // 版 17（1.7.0）: 上級商店・闇市・本編ボスの撃破章。
  16: old => {
    const stage = isObject(old.stage) ? old.stage : {}
    const boss = isObject(old.boss) ? old.boss : {}
    const chapter = int(stage.chapter, 1, 1, CHAPTER_COUNT)
    const beaten = new Set<number>()
    for (let n = 1; n < chapter; n += 1) beaten.add(n)
    if (old.isCleared === true) for (let n = 1; n <= CHAPTER_COUNT; n += 1) beaten.add(n)
    const last = isObject(boss.last) ? boss.last : {}
    const lastChapter = last.chapter
    if (last.won === true && typeof lastChapter === 'number' && Number.isInteger(lastChapter) && lastChapter >= 1 && lastChapter <= CHAPTER_COUNT) beaten.add(lastChapter)
    return { ...old, version: 17, premium: emptyPremium(), blackMarket: emptyBlackMarket(), beatenBosses: [...beaten] }
  },
  // 版 18（1.8.0）: 超能力ツリーとボスの記憶。
  17: old => ({
    ...old,
    version: 18,
    psychic: isObject(old.psychic) ? old.psychic : { ...emptyPsychic(), goldHandAt: int(old.battleSeconds, 0) },
  }),
  // 版 19（1.9.0）: 金山・銀山、大農場（拡張・温室・スプリンクラー・家畜・飾り）、ペット 2 匹目の無料の卵。
  // 1.8.0 のコードは新しい項目を知らずに消してしまうので、版を上げて止まってもらう
  18: old => ({
    ...old,
    version: 19,
    goldMine: isObject(old.goldMine) ? old.goldMine : emptyGoldMine(),
    farm: isObject(old.farm) ? { ...emptyFarm(), ...old.farm } : emptyFarm(),
    pets: isObject(old.pets) ? { ...old.pets, freeEgg: old.pets.freeEgg ?? false } : old.pets,
  }),
  // 版 20（2.0.0）: 図鑑・ボスの魂・封印の魔法陣・真のラスボス・ハード周回。
  // 1.9.0 のコードはこれらを知らずに消してしまうので、版を上げて止まってもらう。図鑑の記録は migrate の最後に分かる範囲で入れる
  19: old => ({
    ...old,
    version: 20,
    codex: isObject(old.codex) ? old.codex : emptyCodex(),
    souls: Array.isArray(old.souls) ? old.souls : [],
    seal: isObject(old.seal) ? old.seal : emptySeal(),
    hard: isObject(old.hard) ? old.hard : { loop: 0 },
  }),
  // 版 21（2.2.0）: 開いたマスの賞品（prize）。古いセーブのマスには賞品が無い。2.1.x のコードは賞品を知らずに消してしまうので、版を上げて止まってもらう
  20: old => ({ ...old, version: 21 }),
  // 版 22（2.3.0）: 生きた魔物（alive）と、ボスと最後に戦った記録（lastBoss）。古いセーブの「負けた魔物」は、勝って賞品を受け取ったマスと見分けられないので、そのままにする（空のマス）
  21: old => ({ ...old, version: 22 }),
  // 版 23（2.4.0）: 鉱山の階ごとの記録（floors）・作り直しの回数（round）・この周回で倒したボス（roundBosses）。2.3.x のコードは知らずに消してしまうので、版を上げて止まってもらう。
  // いまの階のマスは変えない（round 0 の階の作りは今までと同じ）。この周回で倒したボスは、いまの deepest 以下の倒したことのある階
  22: old => {
    if (!isObject(old.mine)) {
      return { ...old, version: 23 }
    }
    const beaten = Array.isArray(old.mine.bossesBeaten) ? old.mine.bossesBeaten : []
    const deepest = typeof old.mine.deepest === 'number' ? old.mine.deepest : 1

    return { ...old, version: 23, mine: { ...old.mine, round: 0, roundBosses: beaten.filter((n): n is number => typeof n === 'number' && n <= deepest), floors: {} } }
  },
  // 版 24: 金山銀山の回収・錬金の端数。旧版の未回収の生産は残し、端数は 0 から始める。
  23: old => ({ ...old, version: 24, goldMine: { ...(isObject(old.goldMine) ? old.goldMine : emptyGoldMine()), goldRemainders: [], silverRemainders: [], alchemyFraction: 0 } }),
  // 版 25: 保存料理・ハード装備の印・実績の追加。既存の実績、称号、持ち物はそのまま。
  24: old => {
    const missions = isObject(old.missions) ? old.missions : {}
    const counts = isObject(missions.counts) ? missions.counts : {}
    const updateGoals = (list: unknown, weekly: boolean): unknown => Array.isArray(list) ? list.map(value => {
      if (!isObject(value) || value.claimed === true) return value
      // 旧条件で達成済みの週課は、未受取でもそのまま受け取れる。未達成のものと次週からは 8 回。
      if (weekly && value.id === 'expeditions' && typeof counts.expeditions === 'number'
        && typeof value.base === 'number' && typeof value.goal === 'number'
        && counts.expeditions - value.base >= value.goal) return value
      const goal = weekly ? (value.id === 'expeditions' ? 8 : value.goal) : value.id === 'mineHits' ? 20 : value.id === 'stairs' ? 2 : value.goal
      return { ...value, goal }
    }) : list
    return {
      ...old, version: 25, dishes: [],
      missions: { ...missions, counts: { ...counts, expeditionReturns: counts.expeditions ?? 0 }, daily: updateGoals(missions.daily, false), weekly: updateGoals(missions.weekly, true) },
    }
  },
  // 版 26: 宿を含む全所持ペットと孵化中の卵を保持する。無料卵の権利は推測しない。
  25: old => ({ ...old, version: 26 }),
  // 版 27: 精算した時刻を保持し、時計の巻き戻しで同じ区間を二度数えない。
  26: (old, now) => {
    const missions = isObject(old.missions) ? old.missions : {}
    const weekly = Array.isArray(missions.weekly) ? missions.weekly.map(mission =>
      isObject(mission) && mission.id === 'stairs' && mission.claimed !== true ? { ...mission, goal: 5 } : mission) : missions.weekly
    return { ...old, version: 27, settledTickAt: timestamp(old.lastTickAt, now), missions: { ...missions, weekly } }
  },
  // 版 28: 自動判断と倉庫の区切りをレア度ごとに選ぶ。
  27: old => {
    const settings = isObject(old.settings) ? old.settings : {}
    const { autoJudge, manualRareUp, keepForSmith, ...rest } = settings
    return { ...old, version: 28, settings: { ...rest, judgeMode: 'equip', curseManual: true,
      manualFrom: autoJudge === false ? 0 : manualRareUp === true ? 2 : -1,
      stashFrom: keepForSmith === true ? 2 : -1 } }
  },
  // 版 29: 古い戦いは再生しない。専用の記憶は封印のほころびだけから引き継ぐ。
  28: old => {
    const seal = isObject(old.seal) ? old.seal : {}
    const boss = isObject(seal.trueBoss) ? seal.trueBoss : {}
    return { ...old, version: 29, seal: { ...seal, playing: null,
      lastTrial: isObject(seal.lastTrial) ? { ...seal.lastTrial, replay: null } : null,
      trueBoss: { ...boss, memory: int(boss.fray, 0, 0, FRAY_MAX),
        last: isObject(boss.last) ? { ...boss.last, replay: null, ending: null } : null } } }
  },
}

const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const num = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

const int = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  Math.floor(num(value, fallback, min, max))

/** Date が扱える時刻の範囲 */
const timestamp = (value: unknown, fallback = 0): number => int(value, int(fallback, 0, 0, 8.64e15), 0, 8.64e15)

// 名前の定義と図鑑の定数から、既知の ID を作る。
const BAG_IDS = new Set(Object.keys(T.bagItem))
const SHOP_IDS = new Set(GOODS.map(good => good.id))
const CODEX_IDS = new Set([
  ...SLOTS.flatMap(slot => Array.from({ length: NAME_VARIANTS }, (_, name) => Array.from({ length: RARITY_COUNT }, (_, rarity) => `gear:${slot}:${name}:${rarity}`)).flat()),
  ...SET_IDS.flatMap(set => SLOTS.map(slot => `set:${set}:${slot}`)),
  ...BOSS_GEAR_IDS.map(id => `boss:${id}`),
  ...CROP_IDS.map(id => `gold:${id}`),
  ...DISH_IDS.map(id => `dish:${id}`),
  ...ORE_IDS.map(id => `ore:${id}`),
  ...SLOTS.flatMap(slot => Array.from({ length: NAME_VARIANTS }, (_, name) => Array.from({ length: RARITY_COUNT }, (_, rarity) => `hard:gear:${slot}:${name}:${rarity}`)).flat()),
  ...SET_IDS.flatMap(set => SLOTS.map(slot => `hard:set:${set}:${slot}`)),
  ...BOSS_GEAR_IDS.map(id => `hard:boss:${id}`),
  ...Array.from({ length: 10 }, (_, i) => `hard:win:${i + 1}`),
  'hard:origin-moth',
])

/** 最新の版の形に、欠けた値を補い、おかしな値を直す */
function normalize(raw: Raw, now: number): SaveData {
  const base = newSave(now)
  const stage = isObject(raw.stage) ? raw.stage : {}
  const boss = isObject(raw.boss) ? raw.boss : {}
  const daily = isObject(raw.daily) ? raw.daily : {}
  const totals = isObject(raw.totals) ? raw.totals : {}

  const equipment = isObject(raw.equipment) ? raw.equipment : {}
  const settings = isObject(raw.settings) ? raw.settings : {}
  const wallet = isObject(raw.wallet) ? raw.wallet : {}
  const titles = isObject(raw.titles) ? raw.titles : {}
  const settledTickAt = timestamp(raw.settledTickAt, Math.min(timestamp(now), timestamp(raw.lastTickAt, base.lastTickAt)))

  const save: SaveData = {
    version: SAVE_VERSION,
    createdAt: timestamp(raw.createdAt, base.createdAt),
    lastTickAt: Math.min(timestamp(now), timestamp(raw.lastTickAt, base.lastTickAt)),
    // 通常の巻き戻しでは精算済み時刻を下げない。30 日より先の壊れた値だけ今に戻す。
    settledTickAt: settledTickAt > timestamp(now) + 30 * 86_400_000 ? timestamp(now) : settledTickAt,
    level: int(raw.level, 1, 1, LEVEL.max),
    exp: num(raw.exp, 0),
    gold: int(raw.gold, 0),
    goldFraction: num(raw.goldFraction, 0, 0, 0.999999),
    lamps: int(raw.lamps, 0, 0, LAMP.stockCap),
    bonusFraction: num(raw.bonusFraction, 0, 0, 1),
    stage: {
      chapter: int(stage.chapter, 1, 1, CHAPTER_COUNT),
      stage: int(stage.stage, 1, 1, BOSS_STAGE),
      kills: num(stage.kills, 0, 0, MAX_GROUP),
      bossTime: num(stage.bossTime, 0),
      // 移動していなければ書かない（0 と同じ）
      ...(num(stage.travel, 0, 0, TRAVEL.seconds) > 0 ? { travel: num(stage.travel, 0, 0, TRAVEL.seconds) } : {}),
      // 前にいた面（稼ぎで面がとんだときだけ書いてある）
      ...(typeof stage.from === 'number' ? { from: int(stage.from, 1, 1, BOSS_STAGE) } : {}),
    },
    daily: {
      day: typeof daily.day === 'string' && DAY.test(daily.day) ? daily.day : '',
      turnLamps: int(daily.turnLamps, 0),
      toolGold: int(daily.toolGold, 0),
      tokenBonus: num(daily.tokenBonus, 0),
    },
    totals: {
      turns: int(totals.turns, 0),
      toolCalls: int(totals.toolCalls, 0),
      tokens: int(totals.tokens, 0),
      offlineMs: int(totals.offlineMs, 0),
      drops: int(totals.drops, 0),
    },
    equipment: Object.fromEntries(SLOTS.map(slot => [slot, item(equipment[slot], slot)])) as Record<SlotId, Item | null>,
    stash: Array.isArray(raw.stash) ? raw.stash.map(value => item(value)).filter((value): value is Item => value !== null).slice(0, 60) : [],
    smith: smith(raw.smith),
    pending: item(raw.pending),
    lastDrop: drop(raw.lastDrop),
    rng: int(raw.rng, base.rng, 0, 0xffffffff),
    nextItemId: int(raw.nextItemId, 1, 1),
    settings: {
      judgeMode: settings.judgeMode === 'sell' ? 'sell' : base.settings.judgeMode,
      manualFrom: typeof settings.manualFrom === 'number' && Number.isInteger(settings.manualFrom) && settings.manualFrom >= -1 && settings.manualFrom < RARITY_COUNT ? settings.manualFrom : base.settings.manualFrom,
      stashFrom: typeof settings.stashFrom === 'number' && Number.isInteger(settings.stashFrom) && settings.stashFrom >= -1 && settings.stashFrom < RARITY_COUNT ? settings.stashFrom : base.settings.stashFrom,
      curseManual: flag(settings.curseManual, base.settings.curseManual),
      autoLamp: flag(settings.autoLamp, base.settings.autoLamp),
      notifyEpic: flag(settings.notifyEpic, base.settings.notifyEpic),
      notifyBoss: flag(settings.notifyBoss, base.settings.notifyBoss),
      bgmVolume: int(settings.bgmVolume, base.settings.bgmVolume, 0, 10),
      seVolume: int(settings.seVolume, base.settings.seVolume, 0, 10),
      isMuted: flag(settings.isMuted, base.settings.isMuted),
      windowsSound: flag(settings.windowsSound, base.settings.windowsSound),
      isBandFolded: flag(settings.isBandFolded, base.settings.isBandFolded),
      language: settings.language === 'ja' || settings.language === 'en' ? settings.language : 'auto',
      debugLog: flag(settings.debugLog, base.settings.debugLog),
      notifyUnlock: flag(settings.notifyUnlock, base.settings.notifyUnlock),
    },
    job: JOB_IDS.includes(raw.job as JobId) ? (raw.job as JobId) : 'novice',
    evolution: int(raw.evolution, 0, 0, EVOLUTION.levels.length),
    jobChangedAt: raw.jobChangedAt === null || raw.jobChangedAt === undefined ? null : timestamp(raw.jobChangedAt),
    battleSeconds: num(raw.battleSeconds, 0),
    boss: {
      retryAt: boss.retryAt === null || boss.retryAt === undefined ? null : timestamp(boss.retryAt),
      last: lastBoss(boss.last),
    },
    isCleared: flag(raw.isCleared, false),
    away: away(raw.away),
    share: share(raw.share),
    clock: lease(raw.clock, now),
    busy: Array.isArray(raw.busy) ? raw.busy.map(busyMark).filter((mark): mark is BusyMark => mark !== null).slice(-16) : [],
    applied: Array.isArray(raw.applied) ? raw.applied.filter((id): id is string => typeof id === 'string').map(id => id.slice(0, 80)).slice(-APPLIED_LIMIT) : [],
    calendar: calendar(raw.calendar),
    bag: bag(raw.bag),
    dishes: Array.isArray(raw.dishes) ? raw.dishes.filter(isObject)
      .filter(dish => typeof dish.id === 'string' && (recipeOf(dish.id)?.buff !== undefined || recipeOf(dish.id)?.stored !== undefined))
      .slice(0, 60).map(dish => ({ id: dish.id as string, quality: num(dish.quality, 1, 1, 3), count: int(dish.count, 0, 0, 9_999) })).filter(dish => dish.count > 0) : [],
    wallet: { stars: int(wallet.stars, 0), psi: int(wallet.psi, 0) },
    titles: { owned: strings(titles.owned, 64), current: typeof titles.current === 'string' ? titles.current.slice(0, 40) : null },
    shop: shop(raw.shop),
    buffs: Array.isArray(raw.buffs) ? raw.buffs.map(buff).filter((b): b is Buff => b !== null).slice(0, SAVE_BUFF_LIMIT) : [],
    missions: missions(raw.missions),
    mine: mine(raw.mine),
    farm: farm(raw.farm),
    pets: pets(raw.pets),
    expedition: expedition(raw.expedition),
    premium: premiumState(raw.premium),
    blackMarket: blackMarketState(raw.blackMarket),
    psychic: psychic(raw.psychic, num(raw.battleSeconds, 0)),
    beatenBosses: Array.isArray(raw.beatenBosses)
      ? [...new Set(raw.beatenBosses.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= CHAPTER_COUNT))].sort((a, b) => a - b)
      : [],
    goldMine: goldMine(raw.goldMine),
    codex: codex(raw.codex),
    souls: chapterSet(raw.souls),
    seal: seal(raw.seal, now),
    hard: { loop: isObject(raw.hard) ? int(raw.hard.loop, 0, 0, 99) : 0 },
  }
  // 遠征だけが参照する架空 ID・二重同行を外す。所持ペットと戦闘枠は動かさない。
  const traveling = new Set<string>()
  save.expedition.adventurers = save.expedition.adventurers.map(adventurer => {
    const trip = adventurer.trip
    if (trip?.pet === undefined) return adventurer
    if (save.pets.owned.some(pet => pet.id === trip.pet) && !traveling.has(trip.pet)) {
      traveling.add(trip.pet)
      return adventurer
    }
    const { pet: _pet, ...withoutPet } = trip
    return { ...adventurer, trip: withoutPet }
  })
  // 装備・ペット・超能力を正規化したあと、戦闘と同じ延長込みの制限で収める。
  return { ...save, stage: { ...save.stage, bossTime: Math.min(save.stage.bossTime, BALANCE.bossSeconds + heroStats(save).bossTimeBonus) } }
}

/** 図鑑: 数は 0 以上、発見の印は既知の ID だけ */
function codex(value: unknown): CodexState {
  const raw = isObject(value) ? value : {}
  const counts = (v: unknown, key: RegExp, limit: number, known?: ReadonlySet<string>): Record<string, number> => {
    const out: Record<string, number> = {}
    if (isObject(v)) {
      // 知らない ID は上限を数える前に捨てる（架空の ID で埋めたセーブで、本物の記録が押し出されないように）
      for (const [id, count] of Object.entries(v).filter(([id]) => known === undefined || known.has(id)).slice(0, limit)) {
        if (key.test(id) && typeof count === 'number' && Number.isFinite(count) && count > 0) out[id] = int(count, 0, 0, 999_999)
      }
    }
    return out
  }
  const chapterCounts = (v: unknown, best: boolean): Record<number, number> => {
    const out: Record<number, number> = {}
    if (isObject(v)) {
      for (const [id, count] of Object.entries(v)) {
        const chapter = Number(id)
        if (Number.isInteger(chapter) && chapter >= 1 && chapter <= CHAPTER_COUNT && typeof count === 'number' && Number.isFinite(count) && count > 0) {
          out[chapter] = best ? Math.min(count, 1e6) : int(count, 0, 0, 999_999)
        }
      }
    }
    return out
  }
  const ids = (v: unknown, limit: number): string[] =>
    Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string' && /^[a-z0-9:-]{1,48}$/.test(id)))].slice(0, limit) : []

  return {
    kills: counts(raw.kills, /^[a-z-]{1,40}$/, 400, new Set(MOB_IDS)),
    bossWins: chapterCounts(raw.bossWins, false),
    bossBest: chapterCounts(raw.bossBest, true),
    seen: ids(Array.isArray(raw.seen) ? raw.seen.filter(id => CODEX_IDS.has(id)) : [], CODEX_IDS.size),
    claimed: ids(raw.claimed, 40),
  }
}

/** 封印の魔法陣: 捧げた章は 1〜10 で重なりなし、時刻は 0 以上、ほころびは 0〜5 */
function seal(value: unknown, now: number): SealState {
  const raw = isObject(value) ? value : {}
  const base = emptySeal()
  const trials: Record<number, { best: number; readyAt: number }> = {}
  if (isObject(raw.trials)) {
    for (const [id, trial] of Object.entries(raw.trials)) {
      const chapter = Number(id)
      if (Number.isInteger(chapter) && chapter >= 1 && chapter <= CHAPTER_COUNT && isObject(trial)) {
        trials[chapter] = { best: num(trial.best, 0, 0, 1e6), readyAt: int(trial.readyAt, 0, 0, 1e15) }
      }
    }
  }
  const lastTrial: SealTrialLast | null = isObject(raw.lastTrial) && Number.isInteger(raw.lastTrial.chapter) && (raw.lastTrial.chapter as number) >= 1 && (raw.lastTrial.chapter as number) <= CHAPTER_COUNT
    ? { chapter: raw.lastTrial.chapter as number, won: flag(raw.lastTrial.won, false), seconds: num(raw.lastTrial.seconds, 0, 0, 1e6), at: int(raw.lastTrial.at, 0, 0, 1e15), replay: null }
    : null
  if (lastTrial !== null && isObject(raw.lastTrial)) lastTrial.replay = sealReplay(raw.lastTrial.replay, 'trial', lastTrial.seconds, lastTrial.won)
  const boss = isObject(raw.trueBoss) ? raw.trueBoss : {}
  const phases = (v: unknown): TrueBossPhase[] =>
    Array.isArray(v)
      ? v.slice(0, 3).flatMap((p): TrueBossPhase[] =>
          isObject(p) && (p.phase === 1 || p.phase === 2 || p.phase === 3)
            ? [{ phase: p.phase, seconds: num(p.seconds, 0, 0, 1e6), damage: num(p.damage, 0, 0, 1e30), heroHpLeft: num(p.heroHpLeft, 0, 0, 1), bossHpLeft: num(p.bossHpLeft, 0, 0, 1) }]
            : [],
        )
      : []
  const last: TrueBossLast | null = isObject(boss.last)
    ? {
        won: flag(boss.last.won, false),
        loop: int(boss.last.loop, 0, 0, 99),
        at: int(boss.last.at, 0, 0, 1e15),
        seconds: num(boss.last.seconds, 0, 0, 1e6),
        phases: phases(boss.last.phases),
        reason: boss.last.reason === 'win' || boss.last.reason === 'down' || boss.last.reason === 'time' ? boss.last.reason : 'time',
        replay: null,
        ending: boss.last.won === true ? sealEnding(boss.last.ending) : null,
      }
    : null
  if (last !== null && isObject(boss.last)) {
    const replay = sealReplay(boss.last.replay, 'origin', last.seconds, last.won, last.phases, last.loop)
    last.replay = replay !== null && replay.reason === last.reason ? replay : null
  }
  let playing: SealPlaying | null = null
  if (isObject(raw.playing) && (raw.playing.kind === 'origin' || raw.playing.kind === 'trial')) {
    const record = raw.playing.kind === 'origin' ? last : lastTrial
    if (record?.replay !== null && record?.replay !== undefined && raw.playing.at === record.at) {
      const maximum = record.at + replayDurationMs(raw.playing.kind, record.replay)
      // 時計が戦った時刻より前なら再生を終える。読み込みのたびに期限を延ばさない。
      const endsAt = Math.min(num(raw.playing.endsAt, maximum, record.at, maximum), now < record.at ? now : maximum)
      playing = { kind: raw.playing.kind, at: record.at, endsAt, skipped: flag(raw.playing.skipped, false), wasBeaten: flag(raw.playing.wasBeaten, false) }
    }
  }

  return {
    offered: chapterSet(raw.offered),
    trials,
    lastTrial,
    playing,
    trueBoss: {
      tries: int(boss.tries, base.trueBoss.tries, 0, 1e9),
      beaten: int(boss.beaten, 0, 0, 99),
      readyAt: int(boss.readyAt, 0, 0, 1e15),
      fray: int(boss.fray, 0, 0, FRAY_MAX),
      memory: int(boss.memory, 0, 0, 5),
      best: num(boss.best, 0, 0, 1e6),
      last,
    },
  }
}

function sealEnding(value: unknown): SealEndingRecord | null {
  if (!isObject(value)) return null
  return { loop: int(value.loop, 0, 0, 99), days: int(value.days, 0, 0, 1e6), kills: int(value.kills, 0, 0, 1e12),
    floor: int(value.floor, 0, 0, 100_000), crops: int(value.crops, 0, 0, CROP_IDS.length),
    pets: Array.isArray(value.pets) ? value.pets.filter((name): name is string => typeof name === 'string').slice(0, PET_SPECIES.length)
      .map(name => name.slice(0, 24).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/gu, '')) : [] }
}

/** 再生の数値を補正すると計算と違う絵になるので、不正なら記録全体だけを捨てる。 */
function sealReplay(value: unknown, kind: 'origin' | 'trial', seconds: number, won: boolean, phases?: TrueBossPhase[], loop = 0): SealReplay | null {
  const valid = (n: unknown, min = 0, max = 1e30): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b))
  if (!isObject(value) || (value.loop !== undefined && (!valid(value.loop, 0, 99) || !Number.isInteger(value.loop))) ||
    !isObject(value.hero) || !JOB_IDS.includes(value.hero.job as JobId) ||
    !valid(value.hero.evolution, 0, EVOLUTION.levels.length) || !Number.isInteger(value.hero.evolution) ||
    !Array.isArray(value.pets) || value.pets.length > 2 ||
    !valid(value.heroHp, Number.MIN_VALUE) || !valid(value.leapHp) || !valid(value.bossHp, Number.MIN_VALUE) || !valid(value.bossStart, Number.MIN_VALUE, 1) ||
    !valid(value.limit, Number.MIN_VALUE, 1e6) || !valid(value.elapsed, 0, value.limit) || !close(value.elapsed, seconds) ||
    !['win', 'down', 'time'].includes(value.reason as string) || (value.reason === 'win') !== won ||
    !valid(value.memory, 0, 25) || value.memory % 5 !== 0 || typeof value.isNewSoul !== 'boolean' || (kind === 'origin' && value.isNewSoul) ||
    !Array.isArray(value.segments) || value.segments.length === 0 || value.segments.length > 16 || !Array.isArray(value.events) || value.events.length > 24) return null
  const pets: SealReplay['pets'] = []
  for (const pet of value.pets) {
    if (!isObject(pet) || !PET_SPECIES.includes(pet.species as PetSpecies) || (pet.form !== 1 && pet.form !== 2 && pet.form !== 3)) return null
    pets.push({ species: pet.species as PetSpecies, form: pet.form })
  }
  const pool = value.heroHp + value.leapHp
  const segments: SealReplaySegment[] = []
  for (const s of value.segments) {
    const prev = segments[segments.length - 1]
    if (!isObject(s) || (kind === 'trial' ? s.phase !== 0 : s.phase !== 1 && s.phase !== 2 && s.phase !== 3) ||
      !valid(s.from, 0, value.elapsed) || !valid(s.to, s.from, value.elapsed) || !valid(s.takenFrom, 0, pool) || !valid(s.takenTo, s.takenFrom, pool) ||
      !valid(s.bossFrom, 0, value.bossStart) || !valid(s.bossTo, 0, s.bossFrom) || typeof s.rage !== 'boolean' || typeof s.petsHalf !== 'boolean' ||
      s.petsHalf !== (s.phase === 1) || (s.rage && s.bossFrom > 0.3 + 1e-8) ||
      !close(s.from, prev?.to ?? 0) || !close(s.takenFrom, prev?.takenTo ?? 0) ||
      (prev !== undefined && (!close(s.bossFrom, prev.bossTo) || (s.phase as number) < prev.phase))) return null
    segments.push({ phase: s.phase as SealReplaySegment['phase'], from: s.from, to: s.to, takenFrom: s.takenFrom, takenTo: s.takenTo,
      bossFrom: s.bossFrom, bossTo: s.bossTo, rage: s.rage, petsHalf: s.petsHalf })
  }
  const end = segments[segments.length - 1]!
  if (!close(end.to, value.elapsed) || (won && !close(end.bossTo, 0)) || (value.reason === 'down' && !close(end.takenTo, pool)) ||
    (value.reason === 'time' && !close(value.elapsed, value.limit))) return null
  if (phases !== undefined) {
    if (!close(phases.reduce((sum, phase) => sum + phase.damage, 0), end.takenTo) || !close(phases[phases.length - 1]?.bossHpLeft ?? -1, end.bossTo)) return null
    for (const phase of phases) {
      const group = segments.filter(segment => segment.phase === phase.phase)
      if (!close(group.reduce((sum, segment) => sum + segment.to - segment.from, 0), phase.seconds) ||
        !close(group.reduce((sum, segment) => sum + segment.takenTo - segment.takenFrom, 0), phase.damage)) return null
    }
  }
  const events: SealReplayEvent[] = []
  let lastShadow = 0
  for (const e of value.events) {
    if (!isObject(e) || !valid(e.at, events[events.length - 1]?.at ?? 0, value.elapsed) ||
      !['fray', 'opening', 'memory', 'rage', 'leap', 'phase', 'shadow'].includes(e.kind as string) ||
      (e.value !== undefined && !valid(e.value, 0, 100)) || (e.raw !== undefined && !valid(e.raw)) || (e.damage !== undefined && !valid(e.damage, 0, pool)) ||
      (e.chapter !== undefined && (!valid(e.chapter, 1, CHAPTER_COUNT) || !Number.isInteger(e.chapter)))) return null
    const event: SealReplayEvent = { at: e.at, kind: e.kind as SealReplayEvent['kind'] }
    if (e.kind === 'shadow') {
      if (kind !== 'origin' || !valid(e.chapter, lastShadow + 1, CHAPTER_COUNT) || !valid(e.raw) || !valid(e.damage, 0, e.raw)) return null
      lastShadow = e.chapter
    } else if (e.chapter !== undefined || e.raw !== undefined || e.damage !== undefined) return null
    if (e.kind === 'phase' && (kind !== 'origin' || e.value !== 1 && e.value !== 2 && e.value !== 3)) return null
    if (e.kind === 'leap' && (value.leapHp === 0 || end.takenTo <= value.heroHp)) return null
    if (['fray', 'opening', 'memory'].includes(event.kind) && (e.at !== 0 || !valid(e.value, Number.MIN_VALUE, 100))) return null
    if (e.kind === 'fray' && kind !== 'origin') return null
    if (e.kind === 'memory' && e.value !== value.memory) return null
    if (e.value !== undefined) event.value = e.value as number
    if (e.chapter !== undefined) event.chapter = e.chapter as number
    if (e.raw !== undefined) event.raw = e.raw as number
    if (e.damage !== undefined) event.damage = e.damage as number
    events.push(event)
  }
  return { loop: value.loop === undefined ? loop : value.loop as number, hero: { job: value.hero.job as JobId, evolution: value.hero.evolution }, pets, heroHp: value.heroHp, leapHp: value.leapHp,
    bossHp: value.bossHp, bossStart: value.bossStart, limit: value.limit, elapsed: value.elapsed, reason: value.reason as SealReplay['reason'],
    memory: value.memory, isNewSoul: value.isNewSoul, segments, events }
}

/** 金山・銀山: 線路は 1〜4 本、強化は 0〜10 段、時刻は 0 以上、作業中の合計は 0 以上 */
function goldMine(value: unknown): GoldMineState {
  const raw = isObject(value) ? value : {}
  const base = emptyGoldMine()
  const fixed: Record<string, number> = {}
  if (isObject(raw.fixed)) {
    for (const [key, at] of Object.entries(raw.fixed).slice(0, 16)) {
      if (/^\d{1,15}:\d{1,2}$/.test(key) && typeof at === 'number' && Number.isFinite(at) && at >= 0) fixed[key] = timestamp(at)
    }
  }
  const collectedAt = int(raw.collectedAt, 0, 0, 1e15)
  const workMs = num(raw.workMs, 0, 0, 1e13)
  const workAt = Math.max(collectedAt, int(raw.workAt, collectedAt, 0, 1e15))
  // 作業中の記録: 古いセーブには無い。無いときは workAt より前を「平らにならした分」として読む（spansFrom = workAt）
  const hasSpans = Array.isArray(raw.workSpans)
  const spansFrom = hasSpans ? Math.min(workAt, Math.max(collectedAt, int(raw.spansFrom, collectedAt, 0, 1e15))) : workAt
  const workSpans: [number, number][] = []
  if (hasSpans) {
    for (const span of (raw.workSpans as unknown[]).slice(-WORK_SPAN_LIMIT)) {
      if (!Array.isArray(span) || typeof span[0] !== 'number' || typeof span[1] !== 'number') continue
      const a = Math.max(spansFrom, Math.floor(span[0]))
      const b = Math.min(workAt, Math.floor(span[1]))
      const prev = workSpans[workSpans.length - 1]
      if (Number.isFinite(a) && Number.isFinite(b) && b > a && (prev === undefined || a >= prev[1])) workSpans.push([a, b])
    }
  }
  // 確定した生産: 古いセーブには無い。無いときは「回収の時刻まで 0」として読む（settledAt = collectedAt）
  const settledAt = Math.max(collectedAt, int(raw.settledAt, collectedAt, 0, 1e15))
  const settledHours = (list: unknown): number[] => (Array.isArray(list) ? list.slice(0, MAX_LINES).map(hours => num(hours, 0, 0, 1e6)) : [])
  const remainders = (list: unknown, lines: number): number[] => Array.isArray(list) ? list.slice(0, lines).map(value => num(value, 0, 0, 1 - Number.EPSILON)) : []
  const last = isObject(raw.last)
    ? { gold: int(raw.last.gold, 0, 0, 1e9), silver: int(raw.last.silver, 0, 0, 1e9), converted: int(raw.last.converted, 0, 0, 1e9), at: int(raw.last.at, 0, 0, 1e15) }
    : null

  return {
    goldLines: int(raw.goldLines, base.goldLines, 1, MAX_LINES),
    silverLines: int(raw.silverLines, base.silverLines, 1, MAX_LINES),
    speed: int(raw.speed, 0, 0, MAX_UPGRADE),
    capacity: int(raw.capacity, 0, 0, MAX_UPGRADE),
    cart: int(raw.cart, 0, 0, 2),
    collectedAt,
    workMs,
    workAt,
    collectWork: num(raw.collectWork, workMs, 0, workMs),
    workSpans,
    spansFrom,
    settledAt,
    settledGold: settledHours(raw.settledGold),
    settledSilver: settledHours(raw.settledSilver),
    goldRemainders: remainders(raw.goldRemainders, int(raw.goldLines, base.goldLines, 1, MAX_LINES)),
    silverRemainders: remainders(raw.silverRemainders, int(raw.silverLines, base.silverLines, 1, MAX_LINES)),
    alchemyFraction: num(raw.alchemyFraction, 0, 0, 1 - Number.EPSILON),
    fixed,
    nuggets: strings(raw.nuggets, 16).filter(id => /^\d{1,15}:\d{1,2}$/.test(id)),
    boostUntil: int(raw.boostUntil, 0, 0, 1e15 + CART_BOOST_MS),
    last,
  }
}

function psychic(value: unknown, battleSeconds: number): PsychicState {
  const raw = isObject(value) ? value : {}
  const bossMemory: Record<number, number> = {}
  const procLog: PsychicProc[] = []
  if (isObject(raw.bossMemory)) {
    for (const [key, value] of Object.entries(raw.bossMemory)) {
      const chapter = Number(key)
      if (Number.isInteger(chapter) && chapter >= 1 && chapter <= CHAPTER_COUNT) {
        const count = int(value, 0, 0, 5)
        if (count > 0) bossMemory[chapter] = count
      }
    }
  }
  if (Array.isArray(raw.procLog)) {
    for (const entry of raw.procLog.slice(-64)) {
      if (!isObject(entry) || typeof entry.id !== 'string' || !PSYCHIC_NODE_IDS.has(entry.id)) continue
      const count = int(entry.count, 1, 1, 1_000_000)
      procLog.push({ id: entry.id, at: num(entry.at, 0, 0, 1e15), count, total: int(entry.total, count, count, Number.MAX_SAFE_INTEGER) })
    }
  }
  const base = emptyPsychic()
  return {
    nodes: [...new Set(strings(raw.nodes, 30).filter(id => PSYCHIC_NODE_IDS.has(id)))],
    resets: int(raw.resets, 0, 0, 1_000_000),
    midasDay: typeof raw.midasDay === 'string' && DAY.test(raw.midasDay) ? raw.midasDay : '',
    bossMemory,
    goldHandAt: Math.min(battleSeconds, num(raw.goldHandAt, battleSeconds, 0, 1e15)),
    procCount: int(raw.procCount, 0, 0, Number.MAX_SAFE_INTEGER),
    lastProc: typeof raw.lastProc === 'string' ? raw.lastProc.slice(0, 40) : base.lastProc,
    procAt: num(raw.procAt, 0, 0, 1e15),
    procLog,
  }
}

/** 日課・週課: 種類は日課・週課に出るもの、目標は 1 以上、はじめの値は 0 以上 */
function missionList(value: unknown, limit: number): Mission[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  const list: Mission[] = []
  for (const entry of value) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !(MISSION_KINDS as readonly string[]).includes(entry.id) || seen.has(entry.id)) {
      continue
    }
    seen.add(entry.id)
    list.push({ id: entry.id, goal: int(entry.goal, 1, 1, COUNT_CAP), base: int(entry.base, 0, 0, COUNT_CAP), claimed: flag(entry.claimed, false) })
  }

  return list.slice(0, limit)
}

function missions(value: unknown): Missions {
  const raw = isObject(value) ? value : {}
  const day = (text: unknown): string => (typeof text === 'string' && DAY.test(text) ? text : '')
  const counts = isObject(raw.counts)
    ? Object.entries(raw.counts)
        .filter(([id, n]) => /^[A-Za-z0-9]{1,30}$/.test(id) && typeof n === 'number' && Number.isFinite(n) && n > 0)
        .slice(0, 50)
        .map(([id, n]) => [id, Math.min(COUNT_CAP, id === 'killsFraction' ? Math.min(1, n as number) : Math.floor(n as number))] as const)
    : []

  return {
    ...emptyMissions(),
    day: day(raw.day),
    daily: missionList(raw.daily, DAILY_COUNT),
    dailySwapped: flag(raw.dailySwapped, false),
    dailyAllClaimed: flag(raw.dailyAllClaimed, false),
    week: day(raw.week),
    weekly: missionList(raw.weekly, WEEKLY_COUNT),
    weeklyAllClaimed: flag(raw.weeklyAllClaimed, false),
    counts: Object.fromEntries(counts),
    achievements: strings(raw.achievements, 100).filter(id => ACHIEVEMENT_IDS.has(id)),
  }
}

/** 鉱山のマス: 種類は決まったもののみ、残りの回数はその階の硬さまで（開いたマスは 0） */
function mineCell(value: unknown, floor: number): MineCell | null {
  if (!isObject(value) || !(MINE_KINDS as readonly string[]).includes(value.kind as string)) {
    return null
  }

  const open = flag(value.open, false)
  const cell: MineCell = { kind: value.kind as string, hp: open ? 0 : int(value.hp, 1, 1, hpOf(value.kind as string, floor)), open }
  const prize = cell.open ? mineHaul(value.prize) : null
  // 生きた魔物は、開いた魔物のマスで賞品が無いものだけ
  const isAlive = cell.open && cell.kind === 'monster' && prize === null && value.alive === true

  return { ...cell, ...(prize === null ? {} : { prize }), ...(isAlive ? { alive: true as const } : {}) }
}

function mineHaul(value: unknown): MineHaul | null {
  if (!isObject(value)) {
    return null
  }

  return {
    items: bag(value.items),
    gold: int(value.gold, 0, 0, 1e12),
    lamps: int(value.lamps, 0, 0, 1_000),
    exp: num(value.exp, 0, 0, 1e12),
    stars: int(value.stars, 0, 0, 1_000_000),
    flags: Array.isArray(value.flags) ? value.flags.filter((f): f is string => typeof f === 'string' && /^[a-z0-9-]{1,20}$/.test(f)).slice(0, 8) : [],
  }
}

/** ボスと最後に戦った記録（割合は 0〜1、秒は 0〜制限時間。形が違えば捨てる） */
function mineBossFight(value: unknown): MineBossFight | null {
  if (!isObject(value) || typeof value.won !== 'boolean' || typeof value.floor !== 'number' || !Number.isInteger(value.floor) || value.floor < 1) {
    return null
  }
  const limit = num(value.limit, 15, 1, 600)

  return {
    floor: Math.min(100_000, value.floor),
    won: value.won,
    seconds: num(value.seconds, limit, 0, limit),
    limit,
    heroHpLeft: num(value.heroHpLeft, 0, 0, 1),
    bossHpLeft: num(value.bossHpLeft, 0, 0, 1),
    at: timestamp(value.at),
  }
}

/** 離れた階の記録: 番号は 0〜34 の整数だけ、同じマスは賞品 > 生きた魔物 > 開いて空 > 叩きかけの順に 1 つだけ。触ったマスが無ければ捨てる */
function mineFloorRecord(value: unknown, floor: number): MineFloorRecord | null {
  if (!isObject(value)) {
    return null
  }
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < CELLS
  const prizes: Record<string, MineHaul> = {}
  if (isObject(value.prizes)) {
    for (const [key, prize] of Object.entries(value.prizes)) {
      const index = Number(key)
      if (!valid(index) || String(index) !== key) continue
      const haul = mineHaul(prize)
      const isEmpty = haul === null || (Object.keys(haul.items).length === 0 && haul.gold === 0 && haul.lamps === 0 && haul.exp === 0 && haul.stars === 0 && haul.flags.length === 0)
      if (valid(index) && haul !== null && !isEmpty) {
        prizes[index] = haul
      }
    }
  }
  const taken = new Set<number>(Object.keys(prizes).map(Number))
  const take = (v: unknown): number[] => {
    const out: number[] = []
    for (const n of Array.isArray(v) ? v : []) {
      if (valid(n) && !taken.has(n)) {
        taken.add(n)
        out.push(n)
      }
    }

    return out.sort((a, b) => a - b)
  }
  const alive = take(value.alive)
  const open = take(value.open)
  const hurt: Record<string, number> = {}
  if (isObject(value.hurt)) {
    for (const [key, hp] of Object.entries(value.hurt)) {
      const index = Number(key)
      if (valid(index) && String(index) === key && !taken.has(index) && typeof hp === 'number' && Number.isInteger(hp) && hp >= 1 && hp <= hpOf('hard', floor)) {
        hurt[index] = hp
      }
    }
  }

  return open.length + alive.length + Object.keys(prizes).length + Object.keys(hurt).length === 0 ? null : { open, hurt, alive, prizes }
}

/** 鉱山: 階は 1 以上、マスは 35 個そろっていなければ空（開いたときに作り直す）、番号の一覧は範囲の中だけ */
function mine(value: unknown): MineState {
  const raw = isObject(value) ? value : {}
  const floor = int(raw.floor, 1, 1, 100_000)
  const cells = Array.isArray(raw.grid) && raw.grid.length === CELLS ? raw.grid.map(cell => mineCell(cell, floor)) : []
  const list = (v: unknown, min: number, max: number, limit: number): number[] =>
    Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= min && n <= max))].sort((a, b) => a - b).slice(0, limit) : []
  const lastBoss = mineBossFight(raw.lastBoss)
  const deepest = Math.max(floor, int(raw.deepest, 1, 1, 100_000))
  const floors: Record<string, MineFloorRecord> = {}
  if (isObject(raw.floors)) {
    for (const [key, record] of Object.entries(raw.floors)) {
      const n = Number(key)
      if (!Number.isInteger(n) || String(n) !== key || n < 1 || n > deepest) continue
      const parsed = mineFloorRecord(record, n)
      if (Number.isInteger(n) && n >= 1 && n <= deepest && parsed !== null) {
        floors[n] = parsed
      }
    }
  }
  const autoLast = isObject(raw.autoLast) ? { items: bag(raw.autoLast.items), hits: int(raw.autoLast.hits, 0, 0, 1_000_000) } : null

  return {
    ...emptyMine(),
    floor,
    deepest,
    grid: cells.length === CELLS && cells.every(c => c !== null) ? (cells as MineCell[]) : [],
    event: (EVENTS as readonly string[]).includes(raw.event as string) ? (raw.event as string) : '',
    picksToday: int(raw.picksToday, 0, 0, 100_000),
    toolsFraction: int(raw.toolsFraction, 0, 0, 4),
    day: typeof raw.day === 'string' && DAY.test(raw.day) ? raw.day : '',
    pickaxe: int(raw.pickaxe, 0, 0, MAX_PICKAXE),
    bomb: flag(raw.bomb, false),
    auto: flag(raw.auto, false),
    autoAt: timestamp(raw.autoAt),
    swings: int(raw.swings, 0, 0, 1e12),
    bossesBeaten: list(raw.bossesBeaten, 1, 100_000, 200),
    fossils: list(raw.fossils, 1, FOSSIL_COUNT, FOSSIL_COUNT),
    diaries: list(raw.diaries, 0, DIARY_COUNT - 1, DIARY_COUNT),
    last: mineHaul(raw.last),
    autoLast,
    round: int(raw.round, 0, 0, 1_000_000),
    roundBosses: list(raw.roundBosses, 1, deepest, 10_000).filter(isBossFloor),
    floors,
    ...(lastBoss === null ? {} : { lastBoss }),
  }
}

function shop(value: unknown): ShopState {
  const raw = isObject(value) ? value : {}
  const text = (v: unknown): string => (typeof v === 'string' && DAY.test(v) ? v : '')

  return {
    ...emptyShop(),
    day: text(raw.day),
    refreshes: int(raw.refreshes, 0, 0, 100),
    bought: bag(raw.bought, SHOP_IDS),
    points: num(raw.points, 0, 0, 1e9),
    spent: num(raw.spent, 0, 0, 1e12),
    greetDay: text(raw.greetDay),
    amuletWeek: text(raw.amuletWeek),
    bagWeek: text(raw.bagWeek),
  }
}

function buff(value: unknown): Buff | null {
  if (!isObject(value) || !BUFF_KINDS.includes(value.kind as Buff['kind'])) {
    return null
  }
  const kind = value.kind as Buff['kind']
  const rate = num(value.rate, 0, 0, 5)
  const dish = typeof value.dish === 'string' && /^[a-z0-9-]{1,40}$/.test(value.dish) ? value.dish : undefined
  if (typeof value.charges === 'number') {
    return { kind, rate, charges: int(value.charges, 0, 0, BUFF_MAX_CHARGES), ...(dish === undefined ? {} : { dish }) }
  }

  return { kind, rate, until: num(value.until, 0), ...(dish === undefined ? {} : { dish }) }
}

/** 農場の区画: 6 区画、既知の作物と範囲内の時刻・成長時間だけを残す */
function farmPlot(value: unknown): FarmPlot | null {
  if (!isObject(value) || typeof value.crop !== 'string' || !CROP_IDS.includes(value.crop)) {
    return null
  }
  const crop = cropOf(value.crop)
  if (crop === undefined || (crop.locked !== undefined && !READY.has(crop.locked))) {
    return null
  }
  const duration = crop.minutes * 60_000
  const fert = flag(value.fert, false)
  const at = timestamp(value.at)
  const from = Math.max(at, timestamp(value.from, at))

  return {
    crop: crop.id,
    at,
    from,
    grown: num(value.grown, 0, 0, duration / (fert ? 1.3 : 1)),
    watered: num(value.watered, 0, 0, duration * 0.3),
    fert,
    ...(flag(value.golden, false) ? { golden: true } : {}),
  }
}

function farmLast(value: unknown): FarmLast | null {
  if (!isObject(value) || typeof value.crop !== 'string' || !CROP_IDS.includes(value.crop) || !QUALITIES.includes(value.quality as string)) {
    return null
  }

  return {
    crop: value.crop,
    quality: value.quality as string,
    amount: int(value.amount, 1, 1, BAG_CAP),
    isOverripe: flag(value.isOverripe, false),
    stars: int(value.stars, 0, 0, 10),
  }
}

/** 畑の区画の数は 6・12・24・36 のどれか（半端な数は次の段に切り上げる） */
const PLOT_SIZES: readonly number[] = [FARM_PLOTS, ...EXPANSIONS.map(e => e.to)]

function animals(value: unknown): Record<string, Animal> {
  const result: Record<string, Animal> = {}
  if (!isObject(value)) {
    return result
  }
  for (const kind of ANIMALS) {
    const entry = value[kind.id]
    if (isObject(entry)) {
      result[kind.id] = {
        affinity: int(entry.affinity, 0, 0, 100),
        fedAt: int(entry.fedAt, 0, 0, 1e15),
        boosted: flag(entry.boosted, false),
        patDay: typeof entry.patDay === 'string' && DAY.test(entry.patDay) ? entry.patDay : '',
      }
    }
  }

  return result
}

function farm(value: unknown): FarmState {
  const raw = isObject(value) ? value : {}
  const stored = Array.isArray(raw.plots) ? raw.plots.slice(0, PLOT_SIZES[PLOT_SIZES.length - 1]) : []
  const size = PLOT_SIZES.find(n => n >= stored.length) ?? FARM_PLOTS
  const plots = stored.map(farmPlot)
  while (plots.length < size) plots.push(null)
  // 温室は建てていれば 6 区画
  const storedGreenhouse: unknown[] = Array.isArray(raw.greenhouse) ? raw.greenhouse : []
  const greenhouse = storedGreenhouse.length > 0 ? Array.from({ length: GREENHOUSE_PLOTS }, (_, i) => farmPlot(storedGreenhouse[i])) : []
  const sprinklers = int(raw.sprinklers, 0, 0, plots.length / 6)
  const cheat = isObject(raw.cheat) && typeof raw.cheat.day === 'string' && DAY.test(raw.cheat.day) && typeof raw.cheat.weather === 'string' && ['sunny', 'cloudy', 'rain', 'storm', 'rainbow', 'meteor'].includes(raw.cheat.weather)
    ? { day: raw.cheat.day, weather: raw.cheat.weather }
    : null

  return {
    plots,
    xp: num(raw.xp, 0, 0, 1e12),
    harvested: strings(raw.harvested, CROP_IDS.length).filter(id => CROP_IDS.includes(id)),
    bugsKilled: int(raw.bugsKilled, 0, 0, 1e9),
    cheat,
    last: farmLast(raw.last),
    greenhouse,
    sprinklers,
    sprinkledAt: sprinklers > 0 ? int(raw.sprinkledAt, 0, 0, 1e15) : 0,
    animals: animals(raw.animals),
    decor: strings(raw.decor, DECOR.length).filter(id => DECOR.some(d => d.id === id)),
    signName: int(raw.signName, 0, 0, SIGN_NAMES),
    petHouseDay: typeof raw.petHouseDay === 'string' && DAY.test(raw.petHouseDay) ? raw.petHouseDay : '',
  }
}

const FEATURE_IDS = new Set<string>(FEATURES.map(f => f.id))
const DAY = /^\d{4}-\d{2}-\d{2}$/
const PET_SPECIES_IDS = new Set<string>(PET_SPECIES)

const isPetSpecies = (value: unknown): value is PetSpecies => typeof value === 'string' && PET_SPECIES_IDS.has(value)

const strings = (value: unknown, limit: number): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string').map(id => id.slice(0, 40)))].slice(0, limit) : []

function calendar(value: unknown): Calendar {
  const raw = isObject(value) ? value : {}
  const day = (text: unknown): string => (typeof text === 'string' && DAY.test(text) ? text : '')

  return {
    ...emptyCalendar(),
    playedDays: int(raw.playedDays, 0, 0, 100_000),
    lastPlayedDay: day(raw.lastPlayedDay),
    firstDay: day(raw.firstDay),
    seen: strings(raw.seen, FEATURES.length).filter((id): id is FeatureId => FEATURE_IDS.has(id)),
    stamps: int(raw.stamps, 0, 0, 100_000),
    isVeteran: flag(raw.isVeteran, false),
    gifted: strings(raw.gifted, FEATURES.length).filter((id): id is FeatureId => FEATURE_IDS.has(id)),
  }
}

function pets(value: unknown): PetsState {
  const raw = isObject(value) ? value : {}
  const seen = new Set<string>()
  const owned: Pet[] = []
  if (Array.isArray(raw.owned)) {
    for (const [index, value] of raw.owned.entries()) {
      if (!isObject(value) || !isPetSpecies(value.species) || owned.length >= PET_SPECIES.length) continue
      const species = value.species
      let id = typeof value.id === 'string' && /^[a-z0-9-]{1,40}$/.test(value.id) ? value.id : `pet-${species}-${index + 1}`
      if (seen.has(id)) id = `pet-${species}-${index + 1}`
      if (seen.has(id)) continue
      seen.add(id)
      const level = int(value.level, 1, 1, 60)
      let form = int(value.form, level >= 20 ? 2 : 1, 1, 3)
      if (level < 20) form = 1
      else if (form < 2) form = 2
      if (level < 45 && form === 3) form = 2
      const name = typeof value.name === 'string' && value.name.trim() !== '' ? value.name.trim().slice(0, 24) : (PET_NAMES[species][0] ?? species)
      const collar = typeof value.collar === 'string' && /^collar-(speed|greed|luck|guard|exp|crit)-r[1-5]$/.test(value.collar) ? value.collar : null
      owned.push({ id, species, name, level, exp: num(value.exp, 0, 0, Math.max(0, petExpToNext(level) - 1e-6)), form: form as PetForm, affinity: int(value.affinity, 0, 0, 100), collar })
    }
  }

  const active = strings(raw.active, 2).filter(id => owned.some(pet => pet.id === id))
  let egg: PetEgg | null = null
  const storedEgg = raw.egg
  // 持っている種の卵は孵れずに止まり、ほかの卵も使えなくなるので外す（数は問わない）
  if (isObject(storedEgg) && isPetSpecies(storedEgg.species) && !owned.some(pet => pet.species === storedEgg.species)) {
    egg = { species: storedEgg.species, answers: int(storedEgg.answers, 0, 0, 9) }
  }
  const pats = isObject(raw.pats) ? raw.pats : {}
  const day = typeof pats.day === 'string' && DAY.test(pats.day) ? pats.day : ''

  return { owned, active, egg, pats: { day, count: int(pats.count, 0, 0, 3) }, freeEgg: flag(raw.freeEgg, false) }
}

function expeditionTrip(value: unknown): ExpeditionTrip | undefined {
  if (!isObject(value)) return undefined
  const hours = int(value.hours, 1, 1, 8)
  if (!EXPEDITION_HOURS.includes(hours as (typeof EXPEDITION_HOURS)[number])) return undefined
  const lunch: ExpeditionLunch = value.lunch === 'lunchbox' || value.lunch === 'dish-onigiri' ? value.lunch : 'none'
  const pet = typeof value.pet === 'string' && /^[a-z0-9-]{1,40}$/.test(value.pet) ? value.pet : undefined

  return {
    chapter: int(value.chapter, 1, 1, CHAPTER_COUNT),
    hours: hours as ExpeditionTrip['hours'],
    startAt: timestamp(value.startAt),
    lunch,
    ...(pet === undefined ? {} : { pet }),
  }
}

function expedition(value: unknown): SaveData['expedition'] {
  const raw = isObject(value) ? value : {}
  const stored = Array.isArray(raw.adventurers) ? raw.adventurers.filter(isObject) : []
  const contract = flag(raw.contract, false)
  const ids = contract ? ADVENTURER_IDS : ADVENTURER_IDS.slice(0, 3)
  const adventurers: Adventurer[] = ids.map(id => {
    const entry: Raw = stored.find(item => item.id === id) ?? {}
    const level = int(entry.level, 1, 1, 30)
    const trip = expeditionTrip(entry.trip)
    return {
      id,
      level,
      exp: num(entry.exp, 0, 0, Math.max(0, level * 100 - 1e-6)),
      ...(trip === undefined ? {} : { trip }),
    }
  })

  return { adventurers, contract }
}

function premiumState(value: unknown): SaveData['premium'] {
  const raw = isObject(value) ? value : {}
  const bought: Record<string, number> = {}
  if (isObject(raw.bought)) {
    for (const [id, count] of Object.entries(raw.bought).slice(0, 100)) {
      if (/^(?:ever:)?[a-z0-9-]{1,40}$/.test(id) && typeof count === 'number' && Number.isFinite(count) && count > 0) {
        bought[id] = int(count, 0, 0, 100_000)
      }
    }
  }
  const date = (v: unknown): string => typeof v === 'string' && DAY.test(v) ? v : ''
  return { week: date(raw.week), bought, saleWeek: date(raw.saleWeek) }
}

function blackMarketState(value: unknown): SaveData['blackMarket'] {
  const raw = isObject(value) ? value : {}
  const bought: Record<string, number> = {}
  if (isObject(raw.bought)) {
    for (const [id, count] of Object.entries(raw.bought).slice(0, 16)) {
      if (/^(visit|mystery-box|time-sand|sealed-shard|curse-gear|stolen-pick)$/.test(id) && typeof count === 'number' && Number.isFinite(count) && count > 0) {
        bought[id] = int(count, 0, 0, 100)
      }
    }
  }
  const night = typeof raw.night === 'string' && /^(?:cheat:)?\d{4}-\d{2}-\d{2}$/.test(raw.night) ? raw.night : ''
  const stories = strings(raw.stories, 13).filter(id => /^(?:intro|nox-[1-5]|sealed-[1-7])$/.test(id))
  return { night, bought, points: int(raw.points, 0, 0, 1e9), stories }
}

/** 持ち物: 既知の ID だけ、個数は 1〜9,999（0 個は書かない） */
function bag(value: unknown, known: ReadonlySet<string> = BAG_IDS): Record<string, number> {
  if (!isObject(value)) {
    return {}
  }
  const entries = Object.entries(value)
    .filter(([id, count]) => known.has(id) && /^[a-z0-9-]{1,40}$/.test(id) && typeof count === 'number' && Number.isFinite(count) && count >= 1)
    .slice(0, 500)
    .map(([id, count]) => [id, Math.min(BAG_CAP, Math.floor(count as number))] as const)

  return Object.fromEntries(entries)
}

/** 担当の期限は、今からこれより先なら捨てる（lease.ts の LEASE_MS は 30 秒。ゆとりを見て 2 倍） */
const LEASE_UNTIL_LIMIT_MS = 60_000
/** ビルド日時は build.generated.ts と同じ ISO の形だけ（比べるのは文字列なので、形がちがうものは捨てる） */
const BUILT_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/

function lease(value: unknown, now: number): TimeLease | null {
  if (!isObject(value) || typeof value.owner !== 'string' || typeof value.build !== 'string' || typeof value.builtAt !== 'string') {
    return null
  }
  // ほかの端末の担当の印に、とても先の期限や、おかしなビルド日時が入っていたら、担当なし（null）に戻す
  const until = timestamp(value.until)
  if (value.builtAt.length > 32 || !BUILT_AT.test(value.builtAt) || until > now + LEASE_UNTIL_LIMIT_MS) {
    return null
  }

  return { owner: value.owner.slice(0, 80), build: value.build.slice(0, 40), builtAt: value.builtAt, until, isWatching: value.isWatching === true }
}

function busyMark(value: unknown): BusyMark | null {
  if (!isObject(value) || typeof value.owner !== 'string') {
    return null
  }
  const from = timestamp(value.from)

  return { owner: value.owner.slice(0, 80), from, to: value.to === null || value.to === undefined ? null : timestamp(value.to, from), seen: timestamp(value.seen, from) }
}

function share(value: unknown): ShareMoment | null {
  if (!isObject(value)) {
    return null
  }
  const at = timestamp(value.at)
  if (value.kind === 'job' && ADVANCED_JOBS.includes(value.job as JobId)) {
    return { kind: 'job', job: value.job as JobId, at }
  }
  if (value.kind === 'evolve' && JOB_IDS.includes(value.job as JobId)) {
    return { kind: 'evolve', job: value.job as JobId, evolution: int(value.evolution, 1, 1, EVOLUTION.levels.length), at }
  }
  if (value.kind === 'boss') {
    return { kind: 'boss', chapter: int(value.chapter, 1, 1, CHAPTER_COUNT), at }
  }
  if (value.kind === 'trueboss') {
    return { kind: 'trueboss', loop: int(value.loop, 0, 0, 99), at }
  }
  const it = item(value.item)
  return value.kind === 'drop' && it !== null ? { kind: 'drop', item: it, at } : null
}

function lastBoss(value: unknown): SaveData['boss']['last'] {
  if (!isObject(value) || typeof value.won !== 'boolean') {
    return null
  }

  return { chapter: int(value.chapter, 1, 1, CHAPTER_COUNT), won: value.won, at: timestamp(value.at) }
}

/** 章の番号の一覧（1〜10、重なりなし、小さい順） */
const chapterSet = (value: unknown): number[] =>
  Array.isArray(value) ? [...new Set(value.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= CHAPTER_COUNT))].sort((a, b) => a - b) : []

const chapters = (value: unknown): number[] => (Array.isArray(value) ? value.filter((n): n is number => Number.isInteger(n)).slice(0, 100) : [])

function away(value: unknown): AwayReport | null {
  if (!isObject(value)) {
    return null
  }

  return {
    seconds: num(value.seconds, 0),
    kills: num(value.kills, 0),
    exp: num(value.exp, 0),
    gold: int(value.gold, 0),
    levels: int(value.levels, 0),
    stages: int(value.stages, 0),
    bossWins: chapters(value.bossWins),
    bossLosses: chapters(value.bossLosses),
    ms: int(value.ms, 0),
    at: timestamp(value.at),
  }
}

/** 装備 1 つを直す。形がおかしければ null（slot を指定したら、その枠の装備でなければ null） */
function item(value: unknown, slot?: SlotId): Item | null {
  if (!isObject(value) || !SLOTS.includes(value.slot as SlotId) || (slot !== undefined && value.slot !== slot)) {
    return null
  }

  return {
    id: int(value.id, 0),
    slot: value.slot as SlotId,
    rarity: int(value.rarity, 0, 0, RARITY_COUNT - 1),
    level: int(value.level, 1, 1),
    power: int(value.power, 1, 1),
    nameIndex: int(value.nameIndex, 0, 0, 99),
    ...(value.plus === undefined ? {} : { plus: int(value.plus, 0, 0, 15) }),
    ...(typeof value.set === 'string' && /^[a-z-]{1,40}$/.test(value.set) ? { set: value.set } : {}),
    ...(typeof value.unique === 'string' && /^[a-z0-9-]{1,40}$/.test(value.unique) ? { unique: value.unique } : {}),
    ...(value.goldTrim === undefined ? {} : { goldTrim: flag(value.goldTrim, false) }),
    ...(flag(value.curse, false) ? { curse: true } : {}),
    ...(flag(value.hard, false) ? { hard: true } : {}),
  }
}

function smith(value: unknown): SaveData['smith'] {
  const raw = isObject(value) ? value : {}
  const week = typeof raw.guardWeek === 'string' && DAY.test(raw.guardWeek) ? raw.guardWeek : ''

  return { zeal: int(raw.zeal, 0, 0, 20), points: int(raw.points, 0, 0, 1e9), guardWeek: week }
}

function drop(value: unknown): Drop | null {
  if (!isObject(value)) {
    return null
  }
  const it = item(value.item)
  const action = value.action
  if (it === null || (action !== 'equipped' && action !== 'sold' && action !== 'pending' && action !== 'stashed' && action !== 'soldFull' && action !== 'equippedSoldFull')) {
    return null
  }

  const stashFullSales = int(value.stashFullSales, 0)
  return { item: it, action, gold: int(value.gold, 0), at: timestamp(value.at), ...(stashFullSales > 0 ? { stashFullSales } : {}) }
}

/**
 * 保存されていた値を最新の版のセーブデータにする。
 * 何も無ければ新しいセーブ。新しすぎる版は SaveTooNewError、形が違えば SaveFormatError。
 */
export function migrate(stored: unknown, now: number): SaveData {
  if (stored === undefined || stored === null) {
    return newSave(now)
  }
  if (!isObject(stored)) {
    throw new SaveFormatError(T.saveError.shape)
  }
  checkSaveSize(stored)
  let raw = stored
  let version = raw.version === undefined ? 0 : raw.version
  const firstVersion = typeof version === 'number' ? version : 0
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new SaveFormatError(T.saveError.version)
  }
  if (version > SAVE_VERSION) {
    throw new SaveTooNewError(version)
  }
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version]
    if (step === undefined) {
      throw new SaveFormatError(T.saveError.noStep(version))
    }
    raw = step(raw, now)
    version += 1
  }

  const result = normalize(raw, now)
  // 新しい実績は残っている記録から確実に分かる下限だけ引き継ぐ。未記録の過去の回数は推測しない。
  if (firstVersion < 25) {
    const goldenBag = Object.entries(result.bag).filter(([id]) => /^crop-[a-z]+-gold$/.test(id)).reduce((sum, [, n]) => sum + n, 0)
    const goldenCrops = Math.max(result.missions.counts.goldenCrops ?? 0, goldenBag, result.codex.seen.filter(id => id.startsWith('gold:')).length)
    const maxPlus = Math.max(result.missions.counts.maxPlus ?? 0, ...[...Object.values(result.equipment), ...result.stash, result.pending].map(item => item?.plus ?? 0))
    if (goldenCrops > 0) result.missions.counts.goldenCrops = goldenCrops
    if (maxPlus > 0) result.missions.counts.maxPlus = maxPlus
  }
  // 図鑑は、版 20 に上げたときに分かる範囲で入れる（倒した章の雑魚・ボス、いまの装備と持ち物）
  const upgraded = firstVersion < 20 ? backfillCodex(result) : result
  // 魂は捧げた分を必ず持っているものとして直す（捧げたあとに魂が消えない）
  const save = upgraded.seal.offered.every(chapter => upgraded.souls.includes(chapter))
    ? upgraded
    : { ...upgraded, souls: [...new Set([...upgraded.souls, ...upgraded.seal.offered])].sort((a, b) => a - b) }
  checkSaveSize(save)
  return save
}

/** 書き出し用の JSON テキスト */
export function exportText(save: SaveData, now: number): string {
  return JSON.stringify({ game: EXPORT_TAG, exportedAt: now, save }, null, 2)
}

/** 書き出したテキストを読み、最新の版のセーブデータにする */
export function importText(text: string, now: number): SaveData {
  if (text.length > SAVE_FILES.importMaxBytes) {
    throw new SaveFormatError(T.saveError.tooLarge(SAVE_FILES.importMaxBytes))
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new SaveFormatError(T.saveError.json)
  }
  if (!isObject(parsed) || parsed.game !== EXPORT_TAG || !isObject(parsed.save)) {
    throw new SaveFormatError(T.saveError.notOurs)
  }

  return migrate(parsed.save, now)
}
