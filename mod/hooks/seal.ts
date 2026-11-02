import type { SaveData, SealReplay, SealReplaySegment, SealState, TrueBossLast, TrueBossPhase } from '../types'
import { BOSS_STAGE, CHAPTER_COUNT } from './world'
import { addItem, grant, isUnlocked, READY } from './calendar'
import { bossAttack, bossDamageWindow, bossHp, bossMemoryPercent, customBossOutcome, hardEnemy, heroStats, stageIndex } from './battle'
import type { HeroStats } from './battle'
import { hasPsychicNode, psychicStarReward, rememberPsychicBoss } from './psychic'
import type { PetEffects } from './pets'
import { activePets, petBattleEffects } from './pets'

// 封印の魔法陣・魂の試練・真のラスボス「始原のバグ ― オリジン・モス」（14 日目、docs/DAILY.md の 14 章）。
// $ を使わない純粋な関数。結果は「その場の計算」（戦闘力・装備・ペット・料理・超能力から決まり、同じセーブなら同じ結果）。

export const CHAPTERS_TOTAL = CHAPTER_COUNT
/** 魂の試練の制限時間（秒）と、負けたあと（と、勝ったあとの再挑戦）に待つ実時間 */
export const TRIAL_SECONDS = 30
export const TRIAL_COOLDOWN_MS = 60 * 60 * 1000
/** 試練のボスは「次の章のボス」の強さ。第 10 章だけはそれを 1.3 倍に */
export const LAST_TRIAL_RATE = 1.3
/** 真のラスボスの制限時間（3 段階の合計）と、負けたあとに待つ実時間 */
export const TRUE_BOSS_SECONDS = 90
export const TRUE_BOSS_COOLDOWN_MS = 3 * 60 * 60 * 1000
/** 真のラスボスの強さ: 第 10 章ボスに対する HP と 1 秒の攻撃の倍率 */
export const TRUE_BOSS_HP_RATE = 4
export const TRUE_BOSS_ATTACK_RATE = 1.5
/** 第 1 形態は 100〜60%、第 2 形態は 60〜25%、第 3 形態は 25〜0%。第 3 形態は攻撃が 2 倍 */
export const PHASE_EDGES: readonly [number, number] = [0.6, 0.25]
export const PHASE3_ATTACK_RATE = 2
/** 第 2 形態の影の 1 回の攻撃は、ボスの何秒ぶんの攻撃か */
export const SHADOW_SECONDS = 3
/** 封印のほころび 1 つで、次の戦いの最初にボスの HP が減る割合と、たまる最大の数 */
export const FRAY_STEP = 0.03
export const FRAY_MAX = 5

export const emptySeal = (): SealState => ({
  offered: [],
  trials: {},
  lastTrial: null,
  playing: null,
  trueBoss: { tries: 0, beaten: 0, readyAt: 0, fray: 0, memory: 0, best: 0, last: null },
})

export const isSealPlaying = (save: SaveData, now: number): boolean =>
  save.seal.playing !== null && !save.seal.playing.skipped && now < save.seal.playing.endsAt

/** 見終わった印だけ変える。報酬・勝敗・記憶には触らない。 */
export function skipSealReplay(save: SaveData, target: { kind: 'origin' | 'trial'; at: number } | null = save.seal.playing): SaveData | undefined {
  return target === null || save.seal.playing === null || save.seal.playing.skipped ||
    save.seal.playing.kind !== target.kind || save.seal.playing.at !== target.at ? undefined
    : { ...save, seal: { ...save.seal, playing: { ...save.seal.playing, skipped: true } } }
}

/** 段階ごとの表示時間（秒）。短い段階を最低時間に固定し、残りを実際の秒数で分け直す。 */
export function replayTimeline(replay: SealReplay): { phase: 1 | 2 | 3; seconds: number }[] {
  const rows = ([1, 2, 3] as const).flatMap(phase => {
    const segments = replay.segments.filter(segment => segment.phase === phase)
    if (segments.length === 0) return []
    const width = phase === 1 ? 0.4 : phase === 2 ? 0.35 : 0.25
    const removed = segments.reduce((sum, segment) => sum + segment.bossFrom - segment.bossTo, 0)
    const complete = segments[segments.length - 1]!.bossTo <= (phase === 1 ? 0.6 : phase === 2 ? 0.25 : 0) + 1e-12
    return [{ phase, actual: segments.reduce((sum, segment) => sum + segment.to - segment.from, 0),
      weight: (phase === 2 ? 10 : 6) * (complete ? 1 : Math.min(1, removed / width)), minimum: phase === 2 && complete ? 6 : 3 }]
  })
  let remaining = Math.max(rows.reduce((sum, row) => sum + row.weight, 0), rows.reduce((sum, row) => sum + row.minimum, 0))
  const seconds = rows.map(() => 0)
  let pending = rows.map((_, i) => i)
  while (pending.length > 0) {
    const actual = pending.reduce((sum, i) => sum + rows[i]!.actual, 0)
    const share = (i: number) => actual > 0 ? remaining * rows[i]!.actual / actual : remaining / pending.length
    const fixed = pending.filter(i => share(i) < rows[i]!.minimum)
    if (fixed.length === 0) {
      for (const i of pending) seconds[i] = share(i)
      break
    }
    for (const i of fixed) { seconds[i] = rows[i]!.minimum; remaining -= seconds[i]! }
    pending = pending.filter(i => !fixed.includes(i))
  }
  return rows.map((row, i) => ({ phase: row.phase, seconds: seconds[i]! }))
}

export const replayDurationMs = (kind: 'origin' | 'trial', replay: SealReplay): number =>
  kind === 'trial' ? 10_000 : (replayTimeline(replay).reduce((sum, row) => sum + row.seconds, 0) + 3) * 1000

function replayBase(save: SaveData, hero: HeroStats, leapHp: number, hp: number, start: number, limit: number, memory: number): SealReplay {
  return { loop: save.hard.loop, hero: { job: save.job, evolution: save.evolution }, pets: activePets(save).slice(0, 2).map(pet => ({ species: pet.species, form: pet.form })),
    heroHp: hero.hp, leapHp, bossHp: hp, bossStart: start, limit, elapsed: 0, reason: 'win', memory, isNewSoul: false, segments: [], events: [] }
}

/** 連続被弾は通常 HP を越える点で分割。影の一撃は区切りの終点に含め、実際の跳び幅は shadow イベントに残す。
 * 最大: 3 段階 + 影 10 + 怒り 1 + タイムリープ 1 = 15 区切り、出来事は最大 18 個。 */
function appendSegment(replay: SealReplay, segment: SealReplaySegment, shadow = false): void {
  if (replay.leapHp > 0 && segment.takenFrom <= replay.heroHp && segment.takenTo > replay.heroHp && !replay.events.some(event => event.kind === 'leap')) {
    const ratio = (replay.heroHp - segment.takenFrom) / (segment.takenTo - segment.takenFrom)
    const at = shadow ? segment.to : segment.from + (segment.to - segment.from) * ratio
    replay.events.push({ at, kind: 'leap' })
    if (!shadow && at > segment.from && at < segment.to) {
      const bossAt = segment.bossFrom + (segment.bossTo - segment.bossFrom) * ratio
      replay.segments.push({ ...segment, to: at, takenTo: replay.heroHp, bossTo: bossAt })
      segment = { ...segment, from: at, takenFrom: replay.heroHp, bossFrom: bossAt }
    }
  }
  replay.segments.push(segment)
}

/** 魔法陣が遊べるか（図鑑と同じ 14 日目） */
export const isSealOpen = (save: SaveData): boolean => READY.has('codex') && isUnlocked(save, 'codex')

/** 魂の灯（上級商店で一度買えば、試練と真のラスボスの待ち時間がなくなる） */
export const hasSoulLamp = (save: SaveData): boolean => (save.bag['soul-lamp'] ?? 0) > 0

export const hasSoul = (save: SaveData, chapter: number): boolean => save.souls.includes(chapter)
export const isOffered = (save: SaveData, chapter: number): boolean => save.seal.offered.includes(chapter)

/** 真のラスボスを倒したことがあるか（主人公のオーラが「始原の光」になる印） */
export const trueBossBeaten = (save: SaveData): boolean => save.seal.trueBoss.beaten >= 1

/** 台座に魂を捧げる（持っていて、まだ捧げていない章） */
export function offerSoul(save: SaveData, chapter: number): SaveData | undefined {
  if (!isSealOpen(save) || !hasSoul(save, chapter) || isOffered(save, chapter)) {
    return undefined
  }

  return { ...save, seal: { ...save.seal, offered: [...save.seal.offered, chapter].sort((a, b) => a - b) } }
}

/** 台座に捧げた数からシルエットの段階（0 = 0〜3 個、1 = 4〜6、2 = 7〜9、3 = 10） */
export function silhouetteStage(save: SaveData): 0 | 1 | 2 | 3 {
  const count = save.seal.offered.length

  return count >= CHAPTERS_TOTAL ? 3 : count >= 7 ? 2 : count >= 4 ? 1 : 0
}

// ---- 魂の試練 ----

export type TrialOutcome = { isWin: boolean; killTime: number; surviveTime: number; limit: number; replay: SealReplay }

/** 試練に挑めるか（倒したことのある章） */
export const canTrial = (save: SaveData, chapter: number): boolean =>
  isSealOpen(save) && chapter >= 1 && chapter <= CHAPTERS_TOTAL && save.beatenBosses.includes(chapter)

/** また挑めるまでの実時間（ミリ秒）。魂の灯があれば 0 */
export function trialWaitMs(save: SaveData, chapter: number, now: number): number {
  return hasSoulLamp(save) ? 0 : Math.max(0, (save.seal.trials[chapter]?.readyAt ?? 0) - now)
}

/** その場の計算: 第 k 章の試練は通し番号 k × 10 + 9 のボスの強さ（第 10 章は 1.3 倍）、制限時間 30 秒 */
export function trialOutcome(save: SaveData, chapter: number): TrialOutcome {
  const n = chapter * 10 + 9
  const rate = chapter >= CHAPTERS_TOTAL ? LAST_TRIAL_RATE : 1
  const target = { kind: 'chapter', chapter } as const
  const hero = heroStats(save, petBattleEffects(save), target)
  const hp = bossHp(n) * rate
  const attack = bossAttack(n) * rate * hero.damageTaken
  const leapHp = hasPsychicNode(save, 'future-10') ? 10 * attack : 0
  const out = customBossOutcome(save, hero, hp, bossAttack(n) * rate, TRIAL_SECONDS)
  const opening = hasPsychicNode(save, 'mind-10') ? 0.08 : 0
  const curve = bossDamageWindow(save, hero.bossDps, hp, 1 - opening)
  const replay = replayBase(save, hero, leapHp, hp, 1, TRIAL_SECONDS + hero.bossTimeBonus, bossMemoryPercent(save, target))
  replay.elapsed = out.duration
  // 本編と同じ: 撃破と被弾・時間切れが同時なら勝ち。敗北の同時刻は倒れる方を先にする。
  replay.reason = out.isWin ? 'win' : out.surviveTime + (leapHp > 0 ? 10 : 0) <= replay.limit ? 'down' : 'time'
  replay.isNewSoul = out.isWin && !hasSoul(save, chapter)
  if (opening > 0) replay.events.push({ at: 0, kind: 'opening', value: opening * 100 })
  if (replay.memory > 0) replay.events.push({ at: 0, kind: 'memory', value: replay.memory })
  const cuts = [0]
  if (curve.rageAt <= out.duration) {
    replay.events.push({ at: curve.rageAt, kind: 'rage', value: 15 })
    if (curve.rageAt > 0 && curve.rageAt < out.duration) cuts.push(curve.rageAt)
  }
  cuts.push(out.duration)
  for (let i = 1; i < cuts.length; i += 1) {
    const from = cuts[i - 1]!, to = cuts[i]!
    appendSegment(replay, { phase: 0, from, to, takenFrom: Math.min(hero.hp + leapHp, from * attack), takenTo: Math.min(hero.hp + leapHp, to * attack),
      bossFrom: curve.fractionAt(from), bossTo: out.isWin && to === out.duration ? 0 : curve.fractionAt(to), rage: from >= curve.rageAt, petsHalf: false })
  }
  replay.events.sort((a, b) => a.at - b.at)
  return { isWin: out.isWin, killTime: out.killTime, surviveTime: out.surviveTime, limit: out.duration, replay }
}

export type TrialResult = { save: SaveData; outcome: TrialOutcome; isNewSoul: boolean }

/** 魂の試練に挑む。待ち時間中・倒していない章は undefined */
export function runTrial(save: SaveData, chapter: number, now: number): TrialResult | undefined {
  if (!canTrial(save, chapter) || trialWaitMs(save, chapter, now) > 0 || isSealPlaying(save, now)) {
    return undefined
  }
  const outcome = trialOutcome(save, chapter)
  const before = save.seal.trials[chapter] ?? { best: 0, readyAt: 0 }
  const isNewSoul = outcome.isWin && !hasSoul(save, chapter)
  let next = rememberPsychicBoss(save, chapter, outcome.isWin)
  if (outcome.isWin) {
    const best = before.best > 0 ? Math.min(before.best, outcome.killTime) : outcome.killTime
    if (isNewSoul) {
      // 初めての魂: ボスの欠片 3・星のかけら 30
      next = addItem({ ...next, souls: [...next.souls, chapter].sort((a, b) => a - b) }, `boss-shard-${chapter}`, 3)
      next = { ...next, wallet: { ...next.wallet, stars: next.wallet.stars + psychicStarReward(next, 30) } }
    }
    // 魂をもう持っているときの再挑戦（最短の勝ち時間を縮める）は、1 時間あけて
    next = { ...next, seal: { ...next.seal, trials: { ...next.seal.trials, [chapter]: { best, readyAt: isNewSoul ? 0 : now + TRIAL_COOLDOWN_MS } } } }
  } else {
    next = { ...next, seal: { ...next.seal, trials: { ...next.seal.trials, [chapter]: { best: before.best, readyAt: now + TRIAL_COOLDOWN_MS } } } }
  }

  return { save: { ...next, seal: { ...next.seal, lastTrial: { chapter, won: outcome.isWin, seconds: outcome.replay.elapsed, at: now, replay: outcome.replay },
    playing: { kind: 'trial', at: now, endsAt: now + replayDurationMs('trial', outcome.replay), skipped: false, wasBeaten: trueBossBeaten(save) } } }, outcome, isNewSoul }
}

// ---- 真のラスボス ----

/** 影の攻撃の弱さ（試練の最短時間が速いほど弱い。記録が無ければ 0.85）。0.4〜1 */
export function shadowFactor(save: SaveData, chapter: number): number {
  const best = Math.min(save.seal.trials[chapter]?.best || Infinity, save.codex.bossBest[chapter] ?? Infinity)

  return best === Infinity ? 0.85 : 0.4 + 0.6 * Math.min(1, best / TRIAL_SECONDS)
}

/** ペットの手伝いを半分にする（第 1 形態「鱗粉の嵐」） */
function halfPets(pet: PetEffects): PetEffects {
  return Object.fromEntries(Object.entries(pet).map(([key, value]) => [key, value * 0.5])) as PetEffects
}

export type TrueBossResult = {
  replay: SealReplay
  isWin: boolean
  reason: 'win' | 'down' | 'time'
  /** 戦った秒数（戦闘の秒数） */
  seconds: number
  limit: number
  phases: TrueBossPhase[]
  /** 最初のボスの HP の割合（封印のほころびの分だけ減る） */
  startFraction: number
  maxHp: number
  attack: number
  /** 影ごとの 1 回の攻撃の弱さ（章 1〜10 の順） */
  shadows: number[]
}

/** 真のラスボスに挑めるか（魂が 10 個そろって台座に捧げてあり、この周回でまだ倒していない。ハードでは本編もクリアし直している） */
export function canChallengeTrueBoss(save: SaveData): boolean {
  return isSealOpen(save) && save.seal.offered.length >= CHAPTERS_TOTAL && save.isCleared && save.seal.trueBoss.beaten <= save.hard.loop
}

/** また挑めるまでの実時間（ミリ秒）。魂の灯があれば 0 */
export function trueBossWaitMs(save: SaveData, now: number): number {
  return hasSoulLamp(save) ? 0 : Math.max(0, save.seal.trueBoss.readyAt - now)
}

/**
 * その場の計算。第 10 章ボスの HP の 4 倍・攻撃の 1.5 倍（ハードはさらに 3 倍、第 3 形態の攻撃はさらに 2 倍）。
 * 第 1 形態（HP 100〜60%）は連続攻撃で、ペットの手伝いが半分。第 2 形態（60〜25%）は 10 体のボスの影が順に 1 回ずつ攻撃する。
 * 第 3 形態（25〜0%）は攻撃が 2 倍。超能力の制限時間の延長・タイムリープは本編のボスと同じように効く。
 */
export function trueBossOutcome(save: SaveData): TrueBossResult {
  const hard = hardEnemy(save)
  const n = stageIndex(CHAPTER_COUNT, BOSS_STAGE)
  const maxHp = bossHp(n) * TRUE_BOSS_HP_RATE * hard
  const attack = bossAttack(n) * TRUE_BOSS_ATTACK_RATE * hard
  const pet = petBattleEffects(save)
  const target = { kind: 'origin' } as const
  const full: HeroStats = heroStats(save, pet, target)
  const half: HeroStats = heroStats(save, halfPets(pet), target)
  const opening = hasPsychicNode(save, 'mind-10') ? 0.08 : 0
  const bossStart = 1 - FRAY_STEP * Math.min(FRAY_MAX, save.seal.trueBoss.fray)
  const startFraction = Math.max(0.3, bossStart - opening)
  const limit = TRUE_BOSS_SECONDS + full.bossTimeBonus
  const leap = hasPsychicNode(save, 'future-10') ? 10 : 0
  // 主人公の体力（タイムリープは第 3 形態の攻撃 10 秒ぶんの余裕）
  const pool = full.hp + leap * attack * PHASE3_ATTACK_RATE * full.damageTaken
  const replay = replayBase(save, full, pool - full.hp, maxHp, bossStart, limit, bossMemoryPercent(save, target))
  if (bossStart < 1) replay.events.push({ at: 0, kind: 'fray', value: FRAY_STEP * Math.min(FRAY_MAX, save.seal.trueBoss.fray) * 100 })
  if (opening > 0) replay.events.push({ at: 0, kind: 'opening', value: opening * 100 })
  if (replay.memory > 0) replay.events.push({ at: 0, kind: 'memory', value: replay.memory })
  const shadows = Array.from({ length: CHAPTER_COUNT }, (_, i) => shadowFactor(save, i + 1))
  const phases: TrueBossPhase[] = []
  let time = 0
  let taken = 0
  let fraction = startFraction
  let reason: TrueBossResult['reason'] = 'win'
  let isDone = false

  const push = (phase: 1 | 2 | 3, seconds: number, damage: number): void => {
    phases.push({ phase, seconds, damage, heroHpLeft: Math.max(0, 1 - taken / pool), bossHpLeft: Math.max(0, fraction) })
  }

  for (const phase of [1, 2, 3] as const) {
    if (isDone) {
      break
    }
    const from = fraction
    const to = phase === 1 ? PHASE_EDGES[0] : phase === 2 ? PHASE_EDGES[1] : 0
    if (from <= to + 1e-12) {
      continue
    }
    const hero = phase === 1 ? half : full
    const curve = bossDamageWindow(save, hero.bossDps, maxHp, from, to)
    const length = curve.seconds
    const timeLeft = limit - time
    const takenBefore = taken
    replay.events.push({ at: time, kind: 'phase', value: phase })
    let traced = 0
    let tracedTaken = taken
    const trace = (until: number, damage: number, shadow = false): void => {
      const cuts = [traced]
      if (phase !== 1 && curve.rageAt > traced && curve.rageAt < until) cuts.push(curve.rageAt)
      cuts.push(until)
      const before = tracedTaken
      for (let i = 1; i < cuts.length; i += 1) {
        const a = cuts[i - 1]!, b = cuts[i]!
        const takenAt = (at: number) => shadow ? at === until ? damage : before
          : before + (damage - before) * (until > traced ? (at - traced) / (until - traced) : 1)
        appendSegment(replay, { phase, from: time + a, to: time + b, takenFrom: takenAt(a), takenTo: takenAt(b),
          bossFrom: curve.fractionAt(a), bossTo: b === length ? to : curve.fractionAt(b),
          rage: phase !== 1 && hasPsychicNode(save, 'mind-9') && a >= curve.rageAt, petsHalf: phase === 1 }, shadow)
      }
      traced = until
      tracedTaken = damage
    }
    let used = length
    if (phase === 2) {
      // 10 体の影が、この形態のあいだに等間隔で 1 回ずつ攻撃する
      for (let i = 0; i < CHAPTER_COUNT; i += 1) {
        const at = ((i + 0.5) / CHAPTER_COUNT) * length
        if (at > timeLeft) {
          used = timeLeft
          reason = 'time'
          isDone = true
          break
        }
        const hit = attack * SHADOW_SECONDS * hero.damageTaken * (shadows[i] ?? 1)
        const damage = Math.min(hit, Math.max(0, pool - taken))
        replay.events.push({ at: time + at, kind: 'shadow', chapter: i + 1, raw: hit, damage })
        if (taken + hit >= pool) {
          taken = pool
          trace(at, taken, true)
          used = at
          reason = 'down'
          isDone = true
          break
        }
        taken += hit
        trace(at, taken, true)
      }
      if (!isDone && length > timeLeft) {
        used = timeLeft
        reason = 'time'
        isDone = true
      }
    } else {
      const rate = attack * (phase === 3 ? PHASE3_ATTACK_RATE : 1) * hero.damageTaken
      const untilDown = (pool - taken) / rate
      // 既存の同時刻の優先順: 形態完了（最終形態なら撃破）> 倒れる > 時間切れ。
      // 影は制限時刻ちょうどでも先に当たり、その一撃で倒れたら時間切れより先に負ける。
      if (untilDown <= timeLeft && untilDown < length) {
        used = untilDown
        taken = pool
        reason = 'down'
        isDone = true
      } else if (length > timeLeft) {
        used = timeLeft
        taken += rate * used
        reason = 'time'
        isDone = true
      } else {
        taken += rate * used
      }
    }
    if (traced < used || replay.segments.length === 0) trace(used, taken)
    if (phase !== 1 && hasPsychicNode(save, 'mind-9') && curve.rageAt <= used && !replay.events.some(event => event.kind === 'rage')) {
      replay.events.push({ at: time + curve.rageAt, kind: 'rage', value: 15 })
    }
    fraction = isDone ? curve.fractionAt(used) : to
    time += used
    push(phase, used, taken - takenBefore)
  }

  replay.elapsed = time
  replay.reason = reason
  replay.events.sort((a, b) => a.at - b.at)
  return { isWin: reason === 'win', reason, seconds: time, limit, phases, startFraction, maxHp, attack, shadows, replay }
}

export type TrueBossRun = { save: SaveData; result: TrueBossResult }

/** 真のラスボスに挑む。勝てば真のエンディングの記録・称号・X ポスト。負ければ封印のほころび 1 つと 3 時間の待ち */
export function challengeTrueBoss(save: SaveData, now: number): TrueBossRun | undefined {
  if (!canChallengeTrueBoss(save) || trueBossWaitMs(save, now) > 0 || isSealPlaying(save, now)) {
    return undefined
  }
  const result = trueBossOutcome(save)
  const last: TrueBossLast = { won: result.isWin, loop: save.hard.loop, at: now, seconds: result.seconds, phases: result.phases, reason: result.reason,
    replay: result.replay, ending: result.isWin ? { loop: save.hard.loop, ...endingRecord(save) } : null }
  const playing = { kind: 'origin', at: now, endsAt: now + replayDurationMs('origin', result.replay), skipped: false, wasBeaten: trueBossBeaten(save) } as const
  const boss = save.seal.trueBoss
  const tries = boss.tries + 1
  if (!result.isWin) {
    return {
      save: { ...save, seal: { ...save.seal, playing, trueBoss: { ...boss, tries, fray: Math.min(FRAY_MAX, boss.fray + 1), memory: Math.min(5, boss.memory + 1), readyAt: hasSoulLamp(save) ? 0 : now + TRUE_BOSS_COOLDOWN_MS, last } } },
      result,
    }
  }
  const best = boss.best > 0 ? Math.min(boss.best, result.seconds) : result.seconds
  const won: SaveData = {
    ...save,
    seal: { ...save.seal, playing, trueBoss: { tries, beaten: Math.max(boss.beaten, save.hard.loop + 1), readyAt: 0, fray: 0, memory: 0, best, last } },
    share: { kind: 'trueboss', loop: save.hard.loop, at: now },
  }

  return { save: grant(won, [{ kind: 'title', id: 'origin' }]), result }
}

/** ハード周回を始められるか（この周回の真のラスボスを倒したあと） */
export const canStartHard = (save: SaveData): boolean => isSealOpen(save) && save.seal.trueBoss.beaten > save.hard.loop

/** 「ハードで第 1 章から」: 本編を第 1 章 1 面から。Lv・装備・ペット・施設・超能力・図鑑・魂はそのまま */
export function startHardLoop(save: SaveData): SaveData | undefined {
  if (!canStartHard(save)) {
    return undefined
  }

  return {
    ...save,
    hard: { loop: save.hard.loop + 1 },
    isCleared: false,
    stage: { chapter: 1, stage: 1, kills: 0, bossTime: 0 },
    boss: { retryAt: null, last: save.boss.last },
    seal: { ...save.seal, trueBoss: { ...save.seal.trueBoss, fray: 0, readyAt: 0 } },
  }
}

/** 真のエンディングの記録（遊んだ日数・倒した数・掘った階・育てた作物の数・ペットの名前） */
export function endingRecord(save: SaveData): { days: number; kills: number; floor: number; crops: number; pets: string[] } {
  return {
    days: save.calendar.playedDays,
    kills: Object.values(save.codex.kills).reduce((sum, count) => sum + count, 0),
    floor: save.mine.deepest,
    crops: save.farm.harvested.length,
    pets: save.pets.owned.map(pet => pet.name),
  }
}

/** 開発用チート: 魂 10 個を捧げ終え、すぐ挑める状態にする（本編もクリア済み。ハード周回中でもクリア済みにする） */
export function cheatReadyTrueBoss(save: SaveData): SaveData {
  const all = Array.from({ length: CHAPTER_COUNT }, (_, i) => i + 1)

  return {
    ...save,
    souls: all,
    isCleared: true,
    beatenBosses: all,
    calendar: { ...save.calendar, playedDays: Math.max(14, save.calendar.playedDays) },
    seal: { ...save.seal, offered: all, trueBoss: { ...save.seal.trueBoss, readyAt: 0, fray: 0 } },
  }
}
