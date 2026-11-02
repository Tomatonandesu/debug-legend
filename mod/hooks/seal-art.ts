import type { SealEndingRecord, SealReplay, SealTrialLast, Sprite } from '../types'
import { heroFigure } from './art'
import { backgroundArt, escapeXml, HP_COLORS, OUTLINE } from './scene'
import { replayDurationMs, replayTimeline } from './seal'
import { ART } from './art.generated'
import { shadowSprite } from './calendar-art'
import { halfSprite, spriteHeight, spritePaths, spriteWidth, svg, SVG_LIMIT } from './sprite'
import { CHAPTERS } from './world'

// 封印の間と真のラスボス戦の絵（Opus、docs/DAILY.md の 14 章）。
// 封印の魔法陣: 床の大きな円（ゆっくり回る呪文の輪）のまわりに 10 の台座。魂を捧げた台座にはボスの小さな姿と、章の色の光の柱。
//   中央には始原のバグの影。捧げた数が増えるほど濃くなり、10 個そろうと魔法陣が明るく回り出して、影が本当の色で揺らめく。倒したあとは光だけ。
// 真のラスボス戦: 最後の戦いを 3 段階でふり返る（第 1 形態 → 十の残響（ボスの影が順に現れる）→ 羽が裂けた第 3 形態 → 勝ち / 負け）。

const W = 200
const H = 120

/** 章の色（台座の光の柱・ボスの欠片と同じ考え。色相を 36 度ずつ） */
export const chapterColor = (chapter: number): string => `hsl(${((chapter - 1) * 36) % 360} 85% 62%)`

/** 小さく描くための絵（大きい絵は 1/2 を何度か） */
function shrink(sprite: Sprite, size: number): Sprite {
  let small = sprite
  while (spriteWidth(small) > size * 1.6) {
    small = halfSprite(small)
  }

  return small
}

/** detail: 絵の細かさの上限（ドット）。大きく描く絵も粗めの絵から描いて、Svg の文字数を抑える */
function placed(sprite: Sprite, cx: number, bottom: number, size: number, extra = '', detail = size): string {
  const small = shrink(sprite, detail)
  const k = size / Math.max(spriteWidth(small), spriteHeight(small))
  const x = cx - (spriteWidth(small) * k) / 2
  const y = bottom - spriteHeight(small) * k

  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})"${extra}>${spritePaths(small)}</g>`
}

/** 封印の魔法陣の Svg（200×120） */
export function sealCircleSvg(offered: readonly number[], stage: number, isBeaten: boolean): string {
  const parts: string[] = []
  const bg = ART['bg-seal']
  if (bg !== undefined) {
    parts.push(`<g transform="scale(${(W / 170).toFixed(4)} ${(H / 80).toFixed(4)})">${spritePaths(bg)}</g><rect width="${W}" height="${H}" fill="#070814" opacity="0.45"/>`)
  } else {
    parts.push(`<rect width="${W}" height="${H}" fill="#0b0d1f"/>`)
  }
  const cx = W / 2
  const cy = 86
  const rx = 78
  const ry = 26
  const isComplete = offered.length >= CHAPTERS.length
  const glow = isComplete || isBeaten ? '#9fd8ff' : '#5c6fd6'
  // 魔法陣（床）: 外の輪・内の輪・回る呪文の点線・星形
  const spin = isComplete ? 12 : 40
  parts.push(
    `<g transform="translate(${cx} ${cy}) scale(1 ${(ry / rx).toFixed(3)})">` +
      `<circle r="${rx}" fill="none" stroke="${glow}" stroke-width="2" opacity="0.8"/>` +
      `<circle r="${rx - 9}" fill="none" stroke="${glow}" stroke-width="1" opacity="0.6"/>` +
      `<g><circle r="${rx - 4.5}" fill="none" stroke="${glow}" stroke-width="3" stroke-dasharray="2 5" opacity="0.7"/>` +
      `<animateTransform attributeName="transform" type="rotate" values="0;360" dur="${spin}s" repeatCount="indefinite"/></g>` +
      `<g opacity="0.55"><path d="${starPath(rx - 12)}" fill="none" stroke="${glow}" stroke-width="1.2"/>` +
      `<animateTransform attributeName="transform" type="rotate" values="360;0" dur="${spin * 1.5}s" repeatCount="indefinite"/></g>` +
      (isComplete ? `<circle r="${rx}" fill="${glow}" opacity="0.12"><animate attributeName="opacity" values="0.05;0.25;0.05" dur="2s" repeatCount="indefinite"/></circle>` : '') +
      `</g>`,
  )
  // 中央の影（始原のバグ）。捧げた数で濃く、10 個で本当の色。倒したあとは光の柱だけ。奥の台座のあと、手前の台座の前に描く
  const centerParts: string[] = []
  const moth = ART['boss-origin-moth']
  if (isBeaten) {
    centerParts.push(`<rect x="${cx - 6}" y="0" width="12" height="${cy}" fill="#fff6d6" opacity="0.35"><animate attributeName="opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite"/></rect>`)
  } else if (moth !== undefined) {
    const opacity = [0.15, 0.3, 0.5, 0.75][Math.min(3, stage)] ?? 0.2
    const body = isComplete ? moth : shadowSprite(moth, '#05060d')
    centerParts.push(
      `<g opacity="${isComplete ? 1 : opacity}">${placed(body, cx, cy - 4, 62)}` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="${isComplete ? 1.8 : 4}s" repeatCount="indefinite"/></g>`,
    )
    if (!isComplete) {
      // ひびの入った封印
      centerParts.push(`<path d="M${cx - 10} ${cy - 30}l6 8-5 6 8 7-3 9" stroke="#c8d4ff" stroke-width="1" fill="none" opacity="${(0.3 + stage * 0.15).toFixed(2)}"/>`)
    }
  }
  // 10 の台座（楕円の上に並べる。奥の台座から描く）
  const altars = CHAPTERS.map((chapter, i) => {
    const angle = (i / CHAPTERS.length) * Math.PI * 2 - Math.PI / 2
    return { chapter: i + 1, boss: chapter.boss, x: cx + Math.cos(angle) * (rx + 2), y: cy + Math.sin(angle) * (ry + 2) }
  }).sort((a, b) => a.y - b.y)
  let isCenterDrawn = false
  for (const altar of altars) {
    if (!isCenterDrawn && altar.y >= cy) {
      parts.push(...centerParts)
      isCenterDrawn = true
    }
    const isLit = offered.includes(altar.chapter)
    const color = chapterColor(altar.chapter)
    parts.push(`<rect x="${(altar.x - 5).toFixed(1)}" y="${(altar.y - 4).toFixed(1)}" width="10" height="6" rx="1" fill="${isLit ? '#3a3f66' : '#23263d'}" stroke="#0a0b14" stroke-width="0.6"/>`)
    if (isLit) {
      parts.push(
        `<rect x="${(altar.x - 3).toFixed(1)}" y="0" width="6" height="${(altar.y - 4).toFixed(1)}" fill="${color}" opacity="0.25"><animate attributeName="opacity" values="0.12;0.35;0.12" dur="${(2 + (altar.chapter % 3) * 0.4).toFixed(1)}s" repeatCount="indefinite"/></rect>`,
      )
      const boss = ART[altar.boss]
      if (boss !== undefined) {
        parts.push(`<g>${placed(boss, altar.x, altar.y - 5, 16)}<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5;0 0" dur="2.2s" begin="${(altar.chapter * 0.2).toFixed(1)}s" repeatCount="indefinite"/></g>`)
      }
    } else {
      parts.push(`<circle cx="${altar.x.toFixed(1)}" cy="${(altar.y - 7).toFixed(1)}" r="2" fill="#3a3f5a"/>`)
    }
  }

  if (!isCenterDrawn) {
    parts.push(...centerParts)
  }

  return svg(W, H, parts.join(''))
}

/** 五芒星の線（中心 0, 0） */
function starPath(r: number): string {
  const points = Array.from({ length: 5 }, (_, i) => {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2
    return `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`
  })

  return `M${points.join('L')}Z`
}

export type OriginReplayLabels = {
  phase: readonly string[]
  shadow: readonly string[]
  win: string
  down: string
  time: string
  fray: (percent: number) => string
  opening: string
  memory: (percent: number) => string
  rage: string
  leap: string
  number: (value: number) => string
}

type ReplayPoint = { at: number; value: number }
const decimal = (value: number): string => String(Math.round(value * 1e6) / 1e6)
const fraction = (value: number): number => Math.max(0, Math.min(1, value))
const replayShadows = new Map<Sprite, Sprite>()

/** 背景を省く → 補助の絵を粗くする → 絵を省く。svg 自体の上限検査はそのまま保つ。
 * 空文字は画面で Svg を置かない印。壊れた記録でも説明・スキップ・結果を表示できる。 */
function boundedReplaySvg(width: number, height: number, body: (quality: number) => string): string {
  try {
    const frame = svg(width, height, '').length
    for (let quality = 0; quality < 3; quality += 1) {
      const content = body(quality)
      if (content.length + frame <= SVG_LIMIT) return svg(width, height, content)
    }
  } catch {
    // 読み込みの検査を通らない古い記録なども、画面全体の例外にしない。
  }
  return ''
}

/** 同色のキーをまとめ、影を 1/2 の解像度・短い path で描く。 */
function originShadow(sprite: Sprite): Sprite {
  const cached = replayShadows.get(sprite)
  if (cached !== undefined) return cached
  // ほかの画面の影色キャッシュとは別の入力を、一度だけ作る。
  const shadow = shadowSprite({ ...halfSprite(sprite) }, '#7d5cff')
  const silhouette = { palette: { s: '#7d5cff' }, rows: shadow.rows.map(row => [...row].map(key => shadow.palette[key] === undefined ? '.' : 's').join('')) }
  replayShadows.set(sprite, silhouette)
  return silhouette
}

/** 記録の実時間を、段階ごとに割り当てられた表示時間へ直線で写す。 */
function replayClock(replay: SealReplay): (at: number) => number {
  let start = 0
  const phases = replayTimeline(replay).map(row => {
    const segments = replay.segments.filter(segment => segment.phase === row.phase)
    const from = segments[0]!.from
    const to = segments[segments.length - 1]!.to
    const phase = { from, to, start, seconds: row.seconds }
    start += row.seconds
    return phase
  })
  return at => {
    const phase = phases.find(row => at <= row.to) ?? phases[phases.length - 1]!
    return phase.start + phase.seconds * (phase.to > phase.from ? fraction((at - phase.from) / (phase.to - phase.from)) : 1)
  }
}

/**
 * 真のラスボス戦（340×160）。動きも数字も挑戦時の記録だけから作る。
 * battleId は戦いの時刻。再描画では同じ ID と文字列を返し、別の戦いの defs とは衝突させない。
 */
export function trueBossReplaySvg(replay: SealReplay, reason: SealReplay['reason'], labels: OriginReplayLabels, still = false, battleId = 'record'): string {
  return boundedReplaySvg(340, 160, quality => battleReplaySvg(replay, reason, labels, still, battleId, undefined, quality))
}

export type TrialReplayLabels = Omit<OriginReplayLabels, 'phase' | 'shadow' | 'win' | 'down' | 'fray'> & {
  title: (chapter: number) => string
  boss: string
  soul: string
  win: (seconds: number) => string
  down: string
}

/** 試練も HP・数字・技・主人公とペットは真のラスボス戦と同じ描画を使う。 */
export function trialReplaySvg(last: SealTrialLast, replay: SealReplay, labels: TrialReplayLabels, still = false): string {
  return boundedReplaySvg(340, 160, quality => {
    const win = replay.isNewSoul ? labels.soul : labels.win(last.seconds)
    return battleReplaySvg(replay, last.won ? 'win' : replay.reason, { ...labels, win, phase: [], shadow: [], fray: () => '' }, still, String(last.at), { last, labels }, quality)
  })
}

function battleReplaySvg(replay: SealReplay, reason: SealReplay['reason'], labels: OriginReplayLabels, still: boolean, battleId: string,
  trial?: { last: SealTrialLast; labels: TrialReplayLabels }, quality = 0): string {
  const total = replayDurationMs(trial === undefined ? 'origin' : 'trial', replay) / 1000
  const outro = trial === undefined ? 3 : 1
  const end = total - outro
  const clock = trial === undefined ? replayClock(replay) : (at: number) => 1 + 8 * (replay.elapsed > 0 ? fraction(at / replay.elapsed) : 0)
  // 呼び出し元の時刻に加え、記録自体も名前に含める（同じ時刻の別記録にも対応）。
  let hash = 2166136261
  for (const char of JSON.stringify(replay)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  const prefix = `${trial === undefined ? 'origin' : `trial-${trial.last.chapter}`}-${battleId.replace(/[^a-zA-Z0-9_-]/g, '_')}-${hash >>> 0}-${still ? 'still' : 'play'}`
  const timing = (at: number, seconds: number) => `begin="${decimal(at)}s" dur="${decimal(seconds)}s" fill="freeze"`
  const animate = (attribute: string, points: ReplayPoint[], discrete = false): string => still ? '' :
    `<animate attributeName="${attribute}" values="${points.map(point => decimal(point.value)).join(';')}" keyTimes="${points.map(point => decimal(point.at / total)).join(';')}" dur="${decimal(total)}s"${discrete ? ' calcMode="discrete"' : ''} fill="freeze"/>`
  const show = (from: number, seconds: number): string => still ? '' :
    `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.8;1" ${timing(from, Math.min(seconds, total - from))}/>`
  const text = (label: string, at: number, seconds: number, y = 39, size = 12, color = '#e8dcff'): string => still ? '' :
    `<text x="170" y="${y}" font-size="${size}" fill="${color}" ${OUTLINE} opacity="0">${escapeXml(label)}${show(at, seconds)}</text>`
  const defs = new Map<string, string>()
  const image = (id: string, sprite: Sprite, cx: number, bottom: number, size: number, detail: number): string => {
    const name = `${prefix}-${id}`
    const small = shrink(sprite, detail)
    const scale = size / Math.max(spriteWidth(small), spriteHeight(small))
    if (!defs.has(name)) defs.set(name, `<g id="${name}">${spritePaths(small)}</g>`)
    return `<use href="#${name}" transform="translate(${decimal(cx - spriteWidth(small) * scale / 2)} ${decimal(bottom - spriteHeight(small) * scale)}) scale(${decimal(scale)})"/>`
  }
  const parts: string[] = []
  const bg = trial === undefined ? ART['bg-void'] : backgroundArt(trial.last.chapter)
  // 影 10 体と長い数字を含めても上限内に収めるため、遠景だけ 1/4 にする。
  const smallBg = bg === undefined || quality > 0 ? undefined : halfSprite(halfSprite(bg))
  parts.push(smallBg === undefined ? `<rect width="340" height="160" fill="#05060f"/>` :
    `<g transform="scale(${trial === undefined ? '8' : `${340 / spriteWidth(smallBg)} ${160 / spriteHeight(smallBg)}`})">${spritePaths(smallBg)}</g><rect width="340" height="160" fill="#04050c" opacity="0.5"/>`)
  if (trial !== undefined) {
    parts.push(text(trial.labels.title(trial.last.chapter), 0, 1, 18, 13), text(trial.labels.boss, 0, 1, 40, 11))
  }

  const leap = replay.events.find(event => event.kind === 'leap')
  const leapAt = leap === undefined ? Infinity : clock(leap.at)
  const heroLeft = (taken: number, at: number, before = false): number =>
    at >= leapAt && !before && replay.leapHp > 0 ? fraction(1 - (taken - replay.heroHp) / replay.leapHp) : fraction(1 - taken / replay.heroHp)
  const first = replay.segments[0]!
  const last = replay.segments[replay.segments.length - 1]!
  const heroPoints: ReplayPoint[] = [{ at: 0, value: heroLeft(first.takenFrom, 0) }]
  const bossPoints: ReplayPoint[] = [{ at: 0, value: replay.bossStart }, { at: 0, value: first.bossFrom }]
  const timerPoints: ReplayPoint[] = [{ at: 0, value: 1 }]
  if (trial !== undefined) timerPoints.push({ at: 1, value: 1 })
  const petPoints: ReplayPoint[] = [{ at: 0, value: first.petsHalf ? 0.45 : 1 }]
  const lunges: { at: number; x: number }[] = [{ at: 0, x: 0 }]
  let numbers = ''
  // 本編 numberAt と同じ輪郭・色・18 ドット上昇。会心の倍率は掛けない。
  const number = (damage: number, x: number, y: number, at: number, seconds: number, color: string): string => still || damage <= 0 ? '' :
    `<text x="${x}" y="${y}" font-size="14" fill="${color}" ${OUTLINE} opacity="0">${escapeXml(labels.number(Math.round(damage)))}` +
    `<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.02;0.25;0.32;1" ${timing(at, seconds)}/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 -18;0 -18" keyTimes="0;0.32;1" ${timing(at, seconds)}/></text>`
  for (const segment of replay.segments) {
    const from = clock(segment.from), to = clock(segment.to)
    const shadows = replay.events.filter(event => event.kind === 'shadow' && event.at > segment.from && event.at <= segment.to)
    const shadowDamage = shadows.reduce((sum, event) => sum + (event.damage ?? 0), 0)
    // 影の一撃は終点の跳び幅。直前の HP を保持してから、その瞬間に減らす。
    const before = segment.takenTo - shadowDamage
    heroPoints.push({ at: from, value: heroLeft(segment.takenFrom, from) },
      { at: to, value: heroLeft(before, to, to === leapAt) })
    if (shadowDamage > 0 || to === leapAt) heroPoints.push({ at: to, value: heroLeft(segment.takenTo, to) })
    bossPoints.push({ at: from, value: segment.bossFrom }, { at: to, value: segment.bossTo })
    timerPoints.push({ at: to, value: fraction(1 - segment.to / replay.limit) })
    petPoints.push({ at: from, value: segment.petsHalf ? 0.45 : 1 })
    const count = Math.max(1, Math.ceil((to - from) / 0.9))
    for (let i = 0; i < count && to > from; i += 1) {
      const duration = (to - from) / count
      const at = from + i * duration
      lunges.push({ at, x: 0 }, { at: at + duration * 0.25, x: 9 }, { at: at + duration * 0.65, x: 0 })
      numbers += number(replay.bossHp * (segment.bossFrom - segment.bossTo) / count, 240, 82, at, duration, '#ffffff')
      numbers += number(Math.max(0, segment.takenTo - segment.takenFrom - shadowDamage) / count, 66, 94, at, duration, '#ff6b6b')
    }
  }
  heroPoints.push({ at: total, value: heroLeft(last.takenTo, end) })
  bossPoints.push({ at: total, value: last.bossTo })
  timerPoints.push({ at: total, value: fraction(1 - replay.elapsed / replay.limit) })
  petPoints.push({ at: total, value: last.petsHalf ? 0.45 : 1 })
  lunges.push({ at: total, x: 0 })

  // ペットは主人公の後ろ。半透明の時刻も、区切りの petsHalf に従う。
  replay.pets.slice(0, 2).forEach((pet, i) => {
    const art = ART[`pet-${pet.species}-${pet.form}`]
    if (art === undefined) return
    const body = image(`pet-${pet.species}-${pet.form}`, art, 22 + i * 27, 149 - i * 4, 35, quality > 1 ? 12 : 24)
    parts.push(`<g opacity="${still ? last.petsHalf ? 0.45 : 1 : first.petsHalf ? 0.45 : 1}">${animate('opacity', petPoints, true)}<g>${body}` +
      (still ? '' : `<animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="0.6s" repeatDur="${decimal(end)}s"/>`) + '</g></g>')
  })
  const hero = heroFigure(replay.hero.job, replay.hero.evolution)
  // 96 ドットの原画は大きいため、48 ドットから同じ表示寸法へ拡大する。
  const heroBody = image('hero', hero.sprite, 66, 152, 96, 48)
  const rage = replay.events.find(event => event.kind === 'rage')
  const rageGlow = rage === undefined ? '' : `<ellipse cx="66" cy="105" rx="43" ry="48" fill="#ff453a" opacity="${still ? 0.2 : 0}">` +
    (still ? '' : `<animate attributeName="opacity" values="0.6;0.2" ${timing(clock(rage.at), 0.6)}/>` ) + '</ellipse>'
  parts.push(`<g>${rageGlow}${heroBody}` + (still ? '' :
    `<animateTransform attributeName="transform" type="translate" values="${lunges.map(point => `${point.x} 0`).join(';')}" keyTimes="${lunges.map(point => decimal(point.at / total)).join(';')}" dur="${decimal(total)}s" fill="freeze"/>`) + '</g>')

  const phase3 = replay.events.find(event => event.kind === 'phase' && event.value === 3)
  const thirdAt = phase3 === undefined ? end : clock(phase3.at)
  const moth1 = ART['boss-origin-moth']
  const moth3 = ART['boss-origin-moth-2'] ?? moth1
  const hardMoth = `${prefix}-hard-moth`
  if (trial === undefined && replay.loop > 0) defs.set(hardMoth, `<filter id="${hardMoth}"><feColorMatrix type="matrix" values="1 0 0 0 0.15 0 0.45 0 0 0 0 0 0.5 0 0 0 0 0 1 0"/></filter>`)
  const moth = (third: boolean) => {
    const art = third ? moth3 : moth1
    const body = art === undefined ? '' : image(third ? 'moth3' : 'moth1', art, 240, 150, 128, 48)
    return replay.loop > 0 ? `<g filter="url(#${hardMoth})">${body}</g>` : body
  }
  const bossFade = reason === 'win' ? [{ at: 0, value: 1 }, { at: end, value: 1 }, { at: end + 0.7, value: 0 }, { at: total, value: 0 }] : []
  if (trial !== undefined) {
    const color = chapterColor(trial.last.chapter)
    const awake = `${prefix}-awake`
    defs.set(awake, `<filter id="${awake}"><feColorMatrix type="hueRotate" values="135"/></filter>`)
    const art = ART[CHAPTERS[trial.last.chapter - 1]!.boss]
    parts.push(`<g opacity="${still && reason === 'win' ? 0 : 1}">${bossFade.length === 0 ? '' : animate('opacity', bossFade)}` +
      `<ellipse cx="240" cy="94" rx="62" ry="56" fill="${color}" opacity="0.2">` +
      (still ? '' : `<animate attributeName="opacity" values="0.12;0.4;0.12" dur="1s" repeatDur="9s" fill="freeze"/>`) + '</ellipse>' +
      (art === undefined ? '' : `<g filter="url(#${awake})">${image('awakened-boss', art, 240, 150, 128, 48)}</g>`) + '</g>')
  } else parts.push(`<g opacity="${still && reason === 'win' ? 0 : 1}">${bossFade.length === 0 ? '' : animate('opacity', bossFade)}` +
    (still ? moth(phase3 !== undefined) :
      `<g>${moth(false)}${phase3 === undefined ? '' : animate('opacity', [{ at: 0, value: 1 }, { at: thirdAt, value: 0 }, { at: total, value: 0 }], true)}</g>` +
      (phase3 === undefined ? '' : `<g opacity="0">${moth(true)}${animate('opacity', [{ at: 0, value: 0 }, { at: thirdAt, value: 1 }, { at: total, value: 1 }], true)}</g>`)) + '</g>')

  if (!still) {
    // 鱗粉は有限回の繰り返し。最終形態では大きく速くなる。
    for (const phase of trial === undefined ? replayTimeline(replay) : []) {
      if (phase.phase === 2) continue
      const segment = replay.segments.find(row => row.phase === phase.phase)!
      const at = clock(segment.from)
      const fast = phase.phase === 3
      const duration = fast ? 0.45 : 0.9
      for (let i = 0; i < 5; i += 1) {
        parts.push(`<g opacity="0">${show(at, phase.seconds)}<circle cx="230" cy="${68 + i * 13}" r="${fast ? 3 : 1.5}" fill="#d6c8ff">` +
          `<animateTransform attributeName="transform" type="translate" values="0 0;-180 ${12 - i * 6}" begin="${decimal(at)}s" dur="${duration}s" repeatDur="${decimal(phase.seconds)}s"/></circle></g>`)
      }
    }
    if (trial === undefined && phase3 !== undefined) parts.push(`<rect width="340" height="160" fill="#ffffff" opacity="0"><animate attributeName="opacity" values="1;0" ${timing(thirdAt, 0.4)}/></rect>`)
    let initial = 0
    for (const event of replay.events) {
      const at = clock(event.at)
      if (event.kind === 'shadow') {
        const chapter = event.chapter ?? 1
        const art = ART[CHAPTERS[chapter - 1]!.boss]
        if (art !== undefined) {
          // 最長の文字と進化した主人公でも収まるよう、影はさらに 1/2 にする。
          parts.push(`<g opacity="0">${image(`shadow-${chapter}`, originShadow(art), 194, 146, 72, quality > 1 ? 16 : 32)}${show(at, 0.6)}</g>`)
        }
        parts.push(text(labels.shadow[chapter - 1] ?? '', at, 0.6, 65, 11))
        numbers += number(event.damage ?? 0, 66, 94, at, Math.min(0.6, total - at), '#ff6b6b')
      } else if (event.kind === 'phase') {
        parts.push(text(labels.phase[(event.value ?? 1) - 1] ?? '', at, 1.4, 23, 13))
      } else {
        const label = event.kind === 'fray' ? labels.fray(event.value ?? 0) : event.kind === 'opening' ? labels.opening :
          event.kind === 'memory' ? labels.memory(event.value ?? 0) : event.kind === 'rage' ? labels.rage : labels.leap
        const opening = event.at === 0 && ['fray', 'opening', 'memory'].includes(event.kind)
        // 開幕の 3 つは縦位置もずらし、長い文字でも重ねない。
        const offset = opening ? initial++ : 0
        parts.push(text(label, at + offset * 0.3, 1.4, 38 + offset * 13, 11, '#ffd166'))
      }
    }
  }
  parts.push(numbers)

  const bar = (id: string, x: number, y: number, width: number, color: string, points: ReplayPoint[]) =>
    `<g id="${prefix}-${id}"><rect x="${x}" y="${y}" width="${width}" height="5" fill="#1b1b28"/>` +
    `<rect x="${x}" y="${y}" width="${decimal(width * (still ? points[points.length - 1]!.value : points[0]!.value))}" height="5" fill="${color}">` +
    animate('width', points.map(point => ({ ...point, value: width * point.value }))) +
    (id !== 'hero-hp' || leap === undefined || still ? '' : `<animate attributeName="fill" values="${HP_COLORS.hero};#ffd60a;#ffd60a" keyTimes="0;${decimal(leapAt / total)};1" calcMode="discrete" dur="${decimal(total)}s" fill="freeze"/>`) + '</rect></g>'
  if (trial !== undefined) parts.push(`<g opacity="${still ? 1 : 0}">${animate('opacity', [{ at: 0, value: 0 }, { at: 1, value: 1 }, { at: total, value: 1 }])}`)
  parts.push(bar('time', 12, 5, 316, '#9fd8ff', timerPoints),
    bar('hero-hp', 43, 54, 46, still && leap !== undefined ? '#ffd60a' : HP_COLORS.hero, heroPoints),
    bar('boss-hp', 185, 24, 110, HP_COLORS.boss, bossPoints))
  if (trial !== undefined) parts.push('</g>')

  if (reason === 'win') {
    if (!still && trial === undefined) {
      for (let i = 0; i < 12; i += 1) parts.push(`<circle cx="240" cy="90" r="2" fill="#ffffff" opacity="0">${show(end, 1)}` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;${Math.cos(i) * 60} ${Math.sin(i) * 50}" ${timing(end, 1)}/></circle>`)
    }
    if (trial !== undefined && replay.isNewSoul) {
      parts.push(`<circle cx="240" cy="${still ? 34 : 90}" r="7" fill="${chapterColor(trial.last.chapter)}" opacity="${still ? 1 : 0}">` +
        (still ? '' : `<animate attributeName="cy" values="90;34" ${timing(end, 1)}/><animate attributeName="opacity" values="0;1" ${timing(end, 0.3)}/>` ) + '</circle>')
    }
    if (trial === undefined) CHAPTERS.forEach((_, i) => {
      const y = 20 + (i % 3) * 8
      parts.push(`<circle cx="${150 + i * 18}" cy="${still ? y : 120}" r="2.5" fill="${chapterColor(i + 1)}" opacity="${still ? 1 : 0}">` +
        (still ? '' : `<animate attributeName="cy" values="120;${y}" ${timing(end + 0.3, 2.7)}/><animate attributeName="opacity" values="0;1" ${timing(end + 0.3, 0.4)}/>` ) + '</circle>')
    })
  } else {
    parts.push(`<rect width="340" height="160" fill="#000000" opacity="${still ? 0.6 : 0}">` +
      (still ? '' : `<animate attributeName="opacity" values="0;0.6" ${timing(end + (reason === 'time' ? outro * 0.8 / 3 : 0), reason === 'time' ? outro * 2.2 / 3 : outro)}/>` ) + '</rect>')
  }
  const ending = reason === 'win' ? labels.win : reason === 'time' ? labels.time : labels.down
  parts.push(`<text x="170" y="80" font-size="${reason === 'win' ? 20 : 16}" fill="${reason === 'win' ? '#fff3b0' : '#c8b8ff'}" ${OUTLINE} opacity="${still ? 1 : 0}">${escapeXml(ending)}` +
    (still ? '' : `<animate attributeName="opacity" values="0;1;1" keyTimes="0;0.2;1" ${timing(end, outro)}/>` ) + '</text>')
  return `<defs>${[...defs.values()].join('')}</defs>${parts.join('')}`
}

export type EndingReplayLabels = {
  title: string
  lines: readonly string[]
  days: (value: number) => string
  kills: (value: number) => string
  floor: (value: number) => string
  crops: (value: number) => string
  pets: (names: string) => string
  loop: (value: number) => string
  thanks: string
}

/** 勝った瞬間の記録だけを流す 30 秒のスタッフロール（340×200）。 */
export function endingReplaySvg(record: SealEndingRecord, labels: EndingReplayLabels, still = false): string {
  return boundedReplaySvg(340, 200, quality => endingReplayBody(record, labels, still, quality))
}

function endingReplayBody(record: SealEndingRecord, labels: EndingReplayLabels, still: boolean, quality: number): string {
  const parts = ['<rect width="340" height="200" fill="#03040d"/>']
  const timing = (at: number, duration: number) => `begin="${at}s" dur="${duration}s" fill="freeze"`
  const stars = CHAPTERS.map((_, i) => ({ x: 35 + i * 30, y: 36 + (i % 3) * 21 }))
  if (!still && quality === 0) {
    for (let i = 0; i < 24; i += 1) {
      parts.push(`<circle cx="${12 + i * 83 % 316}" cy="-8" r="${i % 2 + 1}" fill="#e5e7ff" opacity="0">` +
        `<animate attributeName="opacity" values="0;0.8;0" ${timing(i % 6 / 10, 2.4)}/>` +
        `<animate attributeName="cy" values="-8;208" ${timing(i % 6 / 10, 2.4)}/></circle>`)
    }
  }
  if (quality < 2) {
    parts.push(`<g opacity="${still ? 0.45 : 0}">` + (still ? '' : `<animate attributeName="opacity" values="0;1;0.45" ${timing(3, 4)}/>`))
    stars.forEach((star, i) => {
      if (i > 0) parts.push(`<path d="M${stars[i - 1]!.x} ${stars[i - 1]!.y}L${star.x} ${star.y}" stroke="#aeb9ff" stroke-width="0.6"/>`)
      parts.push(`<g transform="translate(${star.x} ${star.y})"><path d="${starPath(4)}" fill="${chapterColor(i + 1)}"/>` +
        (still ? '' : `<animateTransform attributeName="transform" type="translate" values="170 100;${star.x} ${star.y}" ${timing(3, 3)}/>` ) + '</g>')
    })
    parts.push('</g>')
  }
  if (!still) {
    const lines = [labels.title, ...labels.lines, labels.days(record.days), labels.kills(record.kills), labels.floor(record.floor), labels.crops(record.crops),
      ...(record.pets.length === 0 ? [] : [labels.pets(record.pets.join('・'))]), ...(record.loop > 0 ? [labels.loop(record.loop)] : [])]
    // 全角は 2、半角は 1 として折り返す。18 匹の長い名前も枠の幅に収める。
    const rows: string[] = []
    for (const line of lines) {
      let row = '', width = 0
      for (const char of line) {
        const size = char.charCodeAt(0) > 255 ? 2 : 1
        // 行頭禁則の文字は前の行にぶら下げる。
        if (width + size > 48 && !/[。、，．」』）］｝〉》】〕！？ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ・々ゝゞヽヾ.,!?;:)\]}]/.test(char)) {
          rows.push(row); row = ''; width = 0
        }
        row += char
        width += size
      }
      rows.push(row, '')
    }
    parts.push(`<g opacity="0"><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.99;1" ${timing(7, 20)}/><g>` +
      rows.map((row, i) => `<text x="170" y="${i * 19}" font-size="11" fill="#f3edff" ${OUTLINE}>${escapeXml(row)}</text>`).join('') +
      `<animateTransform attributeName="transform" type="translate" values="0 220;0 ${-rows.length * 19}" ${timing(7, 20)}/></g></g>`)
  }
  parts.push(`<text x="170" y="110" font-size="24" fill="#fff3b0" ${OUTLINE} opacity="${still ? 1 : 0}">${escapeXml(labels.thanks)}` +
    (still ? '' : `<animate attributeName="opacity" values="0;1;1" keyTimes="0;0.6;1" ${timing(27, 3)}/>` ) + '</text>')
  return parts.join('')
}
