import { atom, read, update } from 'claude-code'
import type { RenderElement } from 'claude-code'

import type { SaveData } from '../types'
import { TIME } from './config'
import { beginHardLoop, challengeOriginMoth, challengeSoulTrial, offerSealSoul, skipSealReplay } from './actions'
import type { $ } from './persist'
import { canChallengeTrueBoss, canStartHard, canTrial, endingRecord, hasSoul, isOffered, isSealOpen, isSealPlaying, replayDurationMs, shadowFactor, silhouetteStage, trialWaitMs, trueBossBeaten, trueBossWaitMs } from './seal'
import { T } from './texts'
import { CHAPTER_COUNT, chapterOf } from './world'
import { facilityHeader, itemIcon } from './visual-parts'
import { endingReplaySvg, sealCircleSvg, trialReplaySvg, trueBossReplaySvg } from './seal-art'

// 封印の間のサブ画面（暦タブ →「封印の間」）。10 の台座・魂の試練・真のラスボス・真のエンディングの記録・ハード周回。
// 挑戦の再生中だけ結果を伏せる。見返しの時刻は画面の状態にだけ持つ。

type Els = ReturnType<$['ui']['resolve']>

/** ハード周回の確認中か */
const hardConfirm = atom({ plugin: 'debug-legend', key: 'hardConfirm' } as const, false)
const originReplay = atom({ plugin: 'debug-legend', key: 'originReplay' } as const, null)
const trialReplay = atom({ plugin: 'debug-legend', key: 'trialReplay' } as const, null)
const endingShown = atom({ plugin: 'debug-legend', key: 'endingShown' } as const, null)
const endingReplay = atom({ plugin: 'debug-legend', key: 'endingReplay' } as const, null)

const minutes = (ms: number): number => Math.max(1, Math.ceil(ms / 60_000))
const bossName = (chapter: number): string => T.enemy[chapterOf(chapter).boss] ?? ''
const chapters = Array.from({ length: CHAPTER_COUNT }, (_, i) => i + 1)

/** 封印の間 */
export async function sealView($: $, els: Els, save: SaveData, now: number, tools: { intro: RenderElement | null }): Promise<RenderElement> {
  const { Box, Button, Text } = els
  const seal = save.seal
  if (isSealPlaying(save, now)) {
    return (
      <Box flexDirection="column" gap={1}>
        {sealPicture(els, save, seal.playing!.wasBeaten)}
        {seal.playing!.kind === 'origin' ? replayPicture(els, save, false, null) : trialPicture(els, save, false, null)}
        <Button key="seal-skip" label={T.sealSkip} onPress={async () => {
          const skipped = await skipSealReplay($, { kind: seal.playing!.kind, at: seal.playing!.at })
          if (skipped && seal.playing!.kind === 'origin' && seal.trueBoss.last?.won === true && seal.trueBoss.last.ending !== null) {
            // 描画は純粋なため、スキップ後の最初の描画に使う時刻を操作内で渡す。
            const started = await $.clock.now()
            await update($, endingShown, () => ({ at: seal.trueBoss.last!.at, started }))
          }
        }} />
        <Text>{T.sealWatching}</Text>
      </Box>
    )
  }
  const boss = seal.trueBoss
  const isHard = save.hard.loop > 0
  const confirming = await read($, hardConfirm)
  const stage = silhouetteStage(save)
  const wait = trueBossWaitMs(save, now)
  const canFight = canChallengeTrueBoss(save)
  const last = boss.last
  const trial = seal.lastTrial
  const review = await read($, originReplay)
  const started = last !== null && review?.at === last.at ? review.started : null
  const reviewing = last !== null && last.replay !== null && started !== null && now < started + replayDurationMs('origin', last.replay)
  const trialReview = await read($, trialReplay)
  const trialStarted = trial !== null && trialReview?.at === trial.at ? trialReview.started : null
  const trialReviewing = trial !== null && trial.replay !== null && trialStarted !== null && now < trialStarted + replayDurationMs('trial', trial.replay)
  const endingReview = await read($, endingReplay)
  const shown = await read($, endingShown)
  const playing = seal.playing
  const currentWin = last?.won === true && last.ending !== null && playing?.kind === 'origin' && playing.at === last.at
  const endingStarted = last !== null && endingReview?.at === last.at ? endingReview.started :
    currentWin ? playing.skipped ? shown?.at === last.at ? shown.started : null : playing.endsAt : null
  // 自然終了の枠は次の tick で出る。描画中に状態を書かず、最も遅い初描画にも 30 秒を確保する。
  const endingGrace = last !== null && endingReview?.at === last.at ? 0 : currentWin && !playing.skipped ? TIME.tickMs : 0
  const endingReviewing = endingStarted !== null && now < endingStarted + 30_000 + endingGrace
  const trialAnimation = trialPicture(els, save, false, trialStarted)
  const originAnimation = replayPicture(els, save, false, started)
  const trialArt = trialReviewing && trialAnimation !== null ? trialAnimation : trialPicture(els, save, true, trialStarted)
  const originArt = reviewing && originAnimation !== null ? originAnimation : replayPicture(els, save, true, started)

  return (
    <Box flexDirection="column" gap={1}>
      {sealPicture(els, save) ?? facilityHeader(els, 'codex') ?? <Box />}
      {tools.intro}
      <Box flexDirection="column">
        <Text bold>{T.sealTitle}</Text>
        <Text>{T.sealStatus(seal.offered.length, save.souls.length)}</Text>
        <Text color="#c8a2ff">{T.sealStageText[stage] ?? ''}</Text>
        <Text dimColor>{T.hardLoops(save.hard.loop)}</Text>
      </Box>

      <Box flexDirection="column">
        {chapters.map(chapter => {
          const offered = isOffered(save, chapter)
          const owned = hasSoul(save, chapter)
          const state = offered ? 'offered' : owned ? 'soul' : 'none'
          return (
            <Box key={`seal-altar-${chapter}`} flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center">
              {offered || owned ? (itemIcon(els, `soul-${chapter}`, 20) ?? <Box />) : <Box />}
              <Text color={offered ? '#ffd60a' : undefined} dimColor={!offered && !owned}>
                {T.sealAltar(chapter, offered || owned ? bossName(chapter) : T.codexUnknown, T.sealAltarState[state] ?? '')}
              </Text>
              {owned && !offered ? <Button key={`seal-offer-${chapter}`} label={T.sealOffer(chapter)} variant="primary" onPress={() => offerSealSoul($, chapter)} /> : <Box />}
            </Box>
          )
        })}
      </Box>

      <Box flexDirection="column">
        <Text bold>{T.trialTitle}</Text>
        {trialArt}
        {trialAnimation === null || trial === null ? null : <Button key="trial-watch-again" label={T.sealWatchAgain} onPress={async () => {
          const started = await $.clock.now()
          await update($, trialReplay, () => ({ at: trial.at, started }))
        }} />}
        <Text dimColor>{T.trialHelp}</Text>
        {chapters.map(chapter => {
          const beaten = canTrial(save, chapter)
          const left = trialWaitMs(save, chapter, now)
          const best = seal.trials[chapter]?.best ?? 0
          const state = !beaten ? 'locked' : hasSoul(save, chapter) ? 'soul' : 'ready'
          return (
            <Box key={`trial-${chapter}`} flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center">
              <Text dimColor={!beaten}>
                {T.trialRow(chapter, beaten ? bossName(chapter) : T.codexUnknown, left > 0 ? T.trialWait(minutes(left)) : (T.trialState[state] ?? ''))}
                {best > 0 ? `　${T.trialBest(best)}` : ''}
              </Text>
              {beaten && left === 0 ? <Button key={`trial-go-${chapter}`} label={T.trialGo(chapter)} onPress={() => challengeSoulTrial($, chapter)} /> : <Box />}
            </Box>
          )
        })}
        {trial === null ? <Box /> : <Text color={trial.won ? '#8ff0a4' : '#ff8a8a'}>{T.trialLast(trial.chapter, trial.won, trial.seconds)}</Text>}
      </Box>

      <Box flexDirection="column">
        <Text bold color="#c8a2ff">{isHard ? T.originMothHard : T.originTitle}</Text>
        <Text dimColor>{T.originLore}</Text>
        <Text dimColor>{T.originRule}</Text>
        {!isSealOpen(save) || seal.offered.length < CHAPTER_COUNT ? (
          <Text>{T.originLocked(seal.offered.length)}</Text>
        ) : boss.beaten > save.hard.loop ? (
          <Text color="#8ff0a4">{T.originAlready}</Text>
        ) : !save.isCleared ? (
          <Text>{T.originNeedClear}</Text>
        ) : (
          <Box />
        )}
        {seal.offered.length >= CHAPTER_COUNT ? <Text>{T.originInfo(boss.tries, boss.fray)}</Text> : <Box />}
        {canFight && wait > 0 ? <Text color="#ffb224">{T.originWait(minutes(wait))}</Text> : <Box />}
        {canFight && wait === 0 ? <Button key="origin-go" label={T.originGo} variant="primary" onPress={() => challengeOriginMoth($)} /> : <Box />}
        {last === null ? (
          <Box />
        ) : (
          <Box flexDirection="column">
            {originArt ?? <Box />}
            {originAnimation === null ? <Box /> : <Button key="origin-watch-again" label={T.sealWatchAgain} onPress={async () => {
              const started = await $.clock.now()
              await update($, originReplay, () => ({ at: last.at, started }))
            }} />}
            <Text color={last.won ? '#8ff0a4' : '#ff8a8a'}>
              {T.originResult(last.won, last.seconds)}　{T.originReason[last.reason] ?? ''}
            </Text>
            {last.phases.map(phase => (
              <Text key={`origin-phase-${phase.phase}`}>
                {T.originPhaseLine(T.originPhaseName[phase.phase - 1] ?? '', phase.seconds, Math.round(phase.heroHpLeft * 100), Math.round(phase.bossHpLeft * 100))}
              </Text>
            ))}
          </Box>
        )}
        {seal.offered.length >= CHAPTER_COUNT ? (
          <Box flexDirection="column">
            <Text dimColor>{T.originShadowTitle}</Text>
            {chapters.map(chapter => (
              <Text key={`origin-shadow-${chapter}`} dimColor>
                {T.originShadow(chapter, bossName(chapter), T.shadowMove[chapter - 1] ?? '', Math.round(shadowFactor(save, chapter) * 100))}
              </Text>
            ))}
          </Box>
        ) : (
          <Box />
        )}
      </Box>

      {trueBossBeaten(save) ? endingBox($, els, save, !endingReviewing, endingStarted) : <Box />}

      {canStartHard(save) ? (
        <Box flexDirection="column" borderStyle="round" borderColor="#ff4d6d" paddingX={1}>
          <Text bold color="#ff4d6d">{T.hardTitle}</Text>
          <Text dimColor>{T.hardInfo}</Text>
          {confirming ? (
            <Box flexDirection="column">
              <Text>{T.hardAsk}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key="hard-go" label={T.hardGo} variant="primary" onPress={async () => {
                  await update($, hardConfirm, () => false)
                  await beginHardLoop($)
                }} />
                <Button key="hard-cancel" label={T.hardCancel} onPress={() => update($, hardConfirm, () => false)} />
              </Box>
            </Box>
          ) : (
            <Button key="hard-start" label={T.hardStart} onPress={() => update($, hardConfirm, () => true)} />
          )}
        </Box>
      ) : (
        <Box />
      )}
    </Box>
  )
}

/** 封印の魔法陣の絵（デスクトップ・スマホ） */
function sealPicture(els: Els, save: SaveData, isBeaten = trueBossBeaten(save)): RenderElement | null {
  if (!('Svg' in els)) {
    return null
  }
  const { Svg } = els
  const offered = save.seal.offered
  const source = sealCircleSvg(offered, silhouetteStage(save), isBeaten)

  return <Svg key={`seal-${offered.join('.')}-${isBeaten ? 'b' : ''}`} source={source} alt={T.sealTitle} width={400} height={240} isInteractive />
}

/** 最後の戦いの動く絵、または止まった最後の場面。 */
function replayPicture(els: Els, save: SaveData, still: boolean, started: number | null): RenderElement | null {
  const last = save.seal.trueBoss.last
  if (!('Svg' in els) || last === null || last.replay === null) {
    return null
  }
  const { Svg } = els
  const source = trueBossReplaySvg(last.replay, last.reason, {
    phase: T.originPhaseName, shadow: T.shadowMove, win: T.originReplayWin, down: T.originReplayDown, time: T.originReplayTime,
    fray: T.originReplayFray, opening: T.originReplayOpening, memory: T.originReplayMemory, rage: T.originReplayRage, leap: T.originReplayLeap, number: T.comma,
  }, still, String(last.at))
  if (source === '') return null

  return <Svg key={`origin-replay-${last.at}-${started ?? 'first'}-${still ? 'still' : 'play'}`} source={source} alt={T.sealTitle} width={680} height={320} isInteractive />
}

function trialPicture(els: Els, save: SaveData, still: boolean, started: number | null): RenderElement | null {
  const last = save.seal.lastTrial
  if (!('Svg' in els) || last === null || last.replay === null) return null
  const { Svg } = els
  const source = trialReplaySvg(last, last.replay, {
    title: T.trialReplayTitle, boss: bossName(last.chapter), soul: T.trialReplaySoul, win: T.trialReplayWin, down: T.trialReplayDown,
    time: T.originReplayTime, opening: T.originReplayOpening, memory: T.originReplayMemory, rage: T.originReplayRage, leap: T.originReplayLeap, number: T.comma,
  }, still)
  if (source === '') return null
  return <Svg key={`trial-replay-${last.at}-${started ?? 'first'}-${still ? 'still' : 'play'}`} source={source} alt={T.trialTitle} width={680} height={320} isInteractive />
}

function endingBox($: $, els: Els, save: SaveData, still: boolean, started: number | null): RenderElement {
  const { Box, Button, Text } = els
  const record = save.seal.trueBoss.last?.ending ?? endingRecord(save)
  const last = save.seal.trueBoss.last
  const labels = {
    title: T.endingTitle, lines: T.endingLines, days: T.endingRollDays, kills: T.endingRollKills, floor: T.endingRollFloor,
    crops: T.endingRollCrops, pets: T.endingRollPets, loop: T.endingRollLoop, thanks: T.endingRollThanks,
  }
  const animation = last?.ending == null ? null : endingReplaySvg(last.ending, labels, false)
  const showStill = still || animation === null || animation === ''
  const source = !showStill ? animation : last?.ending == null ? null : endingReplaySvg(last.ending, labels, true)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#ffd60a" paddingX={1}>
      <Text bold color="#ffd60a">{T.endingTitle}</Text>
      {T.endingLines.map((line, i) => (
        <Text key={`ending-line-${i}`}>{line}</Text>
      ))}
      {source === null || source === '' || !('Svg' in els) ? null : <els.Svg key={`ending-replay-${last!.at}-${started ?? 'old'}-${showStill ? 'still' : 'play'}`} source={source} alt={T.endingTitle} width={680} height={400} isInteractive />}
      {animation === null || animation === '' || !('Svg' in els) ? null : <Button key="ending-watch-again" label={T.sealWatchAgain} onPress={async () => {
        const started = await $.clock.now()
        await update($, endingReplay, () => ({ at: last!.at, started }))
      }} />}
      <Text bold>{T.endingRecordTitle}</Text>
      <Text>{T.endingRecord(record.days, record.kills, record.floor, record.crops)}</Text>
      <Text>{record.pets.length > 0 ? T.endingPets(record.pets.join('・')) : T.endingPetsNone}</Text>
      <Text color="#ffd60a">{T.endingTitleGot}</Text>
      <Text dimColor>{T.endingThanks}</Text>
    </Box>
  )
}
