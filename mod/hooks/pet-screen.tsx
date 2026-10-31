import type { RenderElement } from 'claude-code'

import type { Pet, SaveData } from '../types'
import { claimPairEggStars, choosePairPetEgg, choosePetEgg, evolveCompanion, equipPetCollar, exchangeCompanionEgg, feedCompanion, namePet, patPet, removePetCollar, swapCompanion, usePetEgg } from './actions'
import { isNew } from './calendar'
import { introBox } from './daily-screens'
import { petPortrait } from './visual-parts'
import { PET_SPECIES, activePair, activePets, battlePetSlots, canClaimFreeEgg, canExchangePetEgg, eggSpecies, freeEggSpecies, STARTER_SPECIES, effectsForPet, isPetAway, petExpToNext } from './pets'
import type { $ } from './persist'
import { today } from './persist'
import { T } from './texts'

type Els = ReturnType<$['ui']['resolve']>

export const hasPets = (save: SaveData): boolean => battlePetSlots(save) > 0

function flowerCount(save: SaveData): number {
  return ['gold', 'q3', 'q2', 'q1'].reduce((sum, quality) => sum + (save.bag[`crop-flower-${quality}`] ?? 0), 0)
}

function petAssistLine(pet: Pet, save: SaveData): string {
  const effect = effectsForPet(pet, save.job)
  const text = T.petAssist as Record<string, (a: number, b: number) => string>
  switch (pet.species) {
    case 'duck': return text.duck?.(Math.round(effect.protectRate * 100), Math.round(effect.hpRate * 100)) ?? ''
    case 'drake': return text.drake?.(Math.round(effect.attackRate * 100), pet.form === 3 ? 5 : 0) ?? ''
    case 'fox': return text.fox?.(Math.round(effect.critRate * 100), Math.round(effect.attackRate * 100)) ?? ''
    case 'owl': return text.owl?.(Math.round(effect.bossSeconds), Math.round(effect.expRate * 100)) ?? ''
    case 'golem': return text.golem?.(Math.round(effect.attackRate * 100), Math.round(effect.mineRate * 100)) ?? ''
    case 'whale': return text.whale?.(Math.round(effect.luckRate * 100), 0) ?? ''
  }
}

function petCard($: $, els: Els, save: SaveData, pet: Pet, day: string) {
  const { Box, Button, Text } = els
  const away = isPetAway(save, pet.id)
  const active = save.pets.active.includes(pet.id) && !away
  const form = T.petFormNames[pet.species]?.[pet.form - 1] ?? T.petSpeciesName[pet.species] ?? pet.species
  const names = T.petNames[pet.species] ?? []
  const pats = save.pets.pats.day === day ? save.pets.pats.count : 0
  const flowers = flowerCount(save)
  const collars = Object.entries(save.bag).filter(([id, count]) => count > 0 && /^collar-(speed|greed|luck|guard|exp|crit)-r[1-5]$/.test(id))

  return (
    <Box key={`pet-card-${pet.id}`} flexDirection="column" borderStyle="round" paddingX={1} gap={1}>
      <Box flexDirection="row" gap={1} alignItems="center">
        {petPortrait(els, pet.species, pet.form, pet.affinity) ?? <Box />}
        <Box flexDirection="column">
          <Text bold>{pet.name}　{T.petSpeciesName[pet.species] ?? pet.species}</Text>
          <Text>{T.petLevelLine(pet.level, pet.exp, petExpToNext(pet.level), form)}</Text>
          <Text>{T.petAffinity(pet.affinity)}</Text>
          <Text dimColor>{away ? T.petAway : active ? T.petActive : ''}</Text>
        </Box>
      </Box>
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {!away && !active ? Array.from({ length: battlePetSlots(save) }, (_, slot) => {
          const expected = save.pets.active[slot] ?? null
          return slot > save.pets.active.length || (expected !== null && isPetAway(save, expected)) ? <Box key={`pet-slot-${pet.id}-${slot}`} /> : <Button key={`pet-active-${pet.id}-${slot}`} label={T.petSwapSlot(slot + 1, save.pets.owned.find(item => item.id === expected)?.name ?? T.petEmptySlot)} onPress={() => swapCompanion($, pet.id, slot, expected)} />
        }) : <Box />}
        {!away && active ? <Button key={`pet-rest-${pet.id}`} label={T.petRest} onPress={() => swapCompanion($, null, save.pets.active.indexOf(pet.id), pet.id)} /> : <Box />}
        {!away && pats < 3 ? <Button key={`pet-pat-${pet.id}`} label={`${T.petPat} (${T.petPatCount(pats)})`} onPress={() => patPet($, pet.id)} /> : <Text dimColor>{T.petPatCount(pats)}</Text>}
        {(save.bag.treat ?? 0) > 0 && !away ? <Button key={`pet-treat-${pet.id}`} label={`${T.petFeed} ×${save.bag.treat}`} onPress={() => feedCompanion($, pet.id, 'treat')} /> : <Box />}
        {(save.bag['pet-meal'] ?? 0) > 0 && !away ? <Button key={`pet-meal-${pet.id}`} label={`${T.petMeal} ×${save.bag['pet-meal']}`} onPress={() => feedCompanion($, pet.id, 'pet-meal')} /> : <Box />}
      </Box>
      <Box flexDirection="column">
        <Text>{T.petNamesTitle}</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {names.map((name, index) => <Button key={`pet-name-${pet.id}-${index}`} label={name} variant={pet.name === name ? 'primary' : 'secondary'} onPress={() => namePet($, pet.id, name)} />)}
        </Box>
      </Box>
      {!away && pet.level >= 45 && pet.form < 3 ? (
        <Box flexDirection="row" gap={1}>
          {flowers > 0 ? <Button key={`pet-evolve-${pet.id}`} label={`${T.petEvolve} (${T.petNeedFlower(flowers)})`} onPress={() => evolveCompanion($, pet.id)} /> : <Text dimColor>{T.petNeedFlower(flowers)}</Text>}
        </Box>
      ) : <Box />}
      <Box flexDirection="column">
        <Text>{T.petCollarTitle}: {pet.collar === null ? T.petNoCollar : (T.bagItem[pet.collar] ?? pet.collar)}</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {pet.collar !== null && !away ? <Button key={`pet-collar-remove-${pet.id}`} label={T.petCollarRemove} onPress={() => removePetCollar($, pet.id)} /> : <Box />}
          {!away ? collars.map(([id, count]) => <Button key={`pet-collar-${pet.id}-${id}`} label={`${T.bagItem[id] ?? id} ×${count}`} onPress={() => equipPetCollar($, pet.id, id)} />) : <Box />}
        </Box>
      </Box>
      <Box flexDirection="column">
        <Text bold>{T.petHelpTitle}</Text>
        <Text>{petAssistLine(pet, save)}</Text>
      </Box>
    </Box>
  )
}

/** 2 匹目の枠が使える（ペット 2 匹目が開いている） */
export const hasPairSlot = (save: SaveData): boolean => battlePetSlots(save) === 2

/** 相性の行（2 匹が戦闘に出ているとき） */
function pairLines($: $, els: Els, save: SaveData) {
  void $
  const { Box, Text } = els
  const pair = activePair(save)
  if (!hasPairSlot(save)) {
    return <Box />
  }

  return (
    <Box flexDirection="column">
      <Text bold>{T.petPairTitle}</Text>
      {pair === undefined ? <Text dimColor>{T.petPairNone}</Text> : <Text color="#ffd60a">{T.petPairName[pair.id] ?? pair.id} — {T.petPairEffect[pair.id] ?? ''}</Text>}
    </Box>
  )
}

export async function petsTab($: $, els: Els, save: SaveData): Promise<RenderElement> {
  const { Box, Button, Text } = els
  const day = await today($)
  const intro = isNew(save, 'pet') ? await introBox($, els, 'pet') : hasPairSlot(save) && isNew(save, 'pet2') ? await introBox($, els, 'pet2') : undefined
  const egg = save.pets.egg
  const active = activePets(save)

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">{intro ?? <Box />}</Box>
      <Text bold>{T.petTitle}</Text>
      {save.pets.owned.length === 0 && egg === null ? (
        <Box flexDirection="column" gap={1}>
          <Text>{T.petEggTitle}</Text>
          <Text dimColor>{T.petNoPet}</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {STARTER_SPECIES.map(species => (
              <Box key={`pet-egg-box-${species}`} flexDirection="column" alignItems="center">
                {petPortrait(els, species, 1, 0, 48) ?? <Box />}
                <Button key={`pet-egg-${species}`} label={`${T.petSpeciesName[species] ?? species} · ${T.petEggChoose}`} onPress={() => choosePetEgg($, species)} />
              </Box>
            ))}
          </Box>
        </Box>
      ) : <Box />}
      {egg === null ? <Box /> : (
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>{T.petSpeciesName[egg.species] ?? egg.species}</Text>
          <Text>{T.petEggProgress(egg.answers)}</Text>
        </Box>
      )}
      {canClaimFreeEgg(save) ? (
        <Box flexDirection="column" gap={1} borderStyle="round" paddingX={1}>
          <Text bold>{T.petFreeEggTitle}</Text>
          <Text dimColor>{T.petFreeEggHint}</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {freeEggSpecies(save).map(species => (
              <Box key={`pet-pair-egg-box-${species}`} flexDirection="column" alignItems="center">
                {petPortrait(els, species, 1, 0, 48) ?? <Box />}
                <Button key={`pet-pair-egg-${species}`} label={`${T.petSpeciesName[species] ?? species} · ${T.petEggChoose}`} onPress={() => choosePairPetEgg($, species)} />
              </Box>
            ))}
            {freeEggSpecies(save).length === 0 && save.pets.owned.length > 0 ? <Button key="pet-free-egg-stars" label={T.petFreeEggStars} onPress={() => claimPairEggStars($)} /> : <Box />}
          </Box>
        </Box>
      ) : <Box />}
      <Text bold>{T.petBattleSlots(save.pets.active.length, battlePetSlots(save))}</Text>
      {save.pets.active.map(id => save.pets.owned.find(pet => pet.id === id)).filter((pet): pet is Pet => pet !== undefined).map(pet => petCard($, els, save, pet, day))}
      {save.pets.owned.filter(pet => isPetAway(save, pet.id) && !save.pets.active.includes(pet.id)).map(pet => petCard($, els, save, pet, day))}
      <Box flexDirection="column" gap={1}>
        <Text bold>{T.petInnTitle}</Text>
        <Text dimColor>{T.petInnHint}</Text>
        {save.pets.owned.filter(pet => !save.pets.active.includes(pet.id) && !isPetAway(save, pet.id)).sort((a, b) => PET_SPECIES.indexOf(a.species) - PET_SPECIES.indexOf(b.species)).map(pet => petCard($, els, save, pet, day))}
        <Text>{T.petBagEggs(save.bag.egg ?? 0)}</Text>
        {(save.bag.egg ?? 0) > 0 ? <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {eggSpecies(save).map(species => <Button key={`pet-bag-egg-${species}`} label={`${T.petSpeciesName[species]} · ${T.petEggChoose}`} onPress={() => usePetEgg($, species)} />)}
          {eggSpecies(save).length === 0 ? <Text dimColor>{T.petEggWait}</Text> : <Box />}
          {canExchangePetEgg(save) ? <Button key="pet-egg-exchange" label={T.petEggExchange} onPress={() => exchangeCompanionEgg($)} /> : <Box />}
        </Box> : <Box />}
      </Box>
      {save.pets.owned.length > 0 && save.pets.owned.length < 2 && !hasPairSlot(save) ? <Text dimColor>{T.petPairLater}</Text> : <Box />}
      {pairLines($, els, save)}
      <Box flexDirection="column">
        <Text bold>{T.petHelpTitle}</Text>
        {active.length === 0 ? <Text dimColor>{T.petNoHelp}</Text> : <Box flexDirection="column">{active.map(pet => <Text key={`pet-help-${pet.id}`}>{pet.name}: {petAssistLine(pet, save)}</Text>)}</Box>}
      </Box>
    </Box>
  )
}
