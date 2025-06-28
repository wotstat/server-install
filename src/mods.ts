
type ModsTags =
  'wotstat.analytics' |
  'wotstat.positions' |
  'wotstat.widgets' |
  'wotstat.lootbox-open-multiplier' |
  'me.poliroid.modslistapi-wotstat' |
  'izeberg.modssettingsapi'

export type ModSource = {
  type: 'gitlab-description',
  repo: string
  repoId: number
} | {
  type: 'github',
  owner: string,
  repo: string
}

type Mod = {
  tag: ModsTags
  source?: ModSource,
}


export const mods: Mod[] = [
  { tag: 'wotstat.analytics', source: { type: 'github', owner: 'wotstat', repo: 'wotstat-analytics' } },
  { tag: 'wotstat.positions', source: { type: 'github', owner: 'wotstat', repo: 'wotstat-positions' } },
  { tag: 'wotstat.widgets', source: { type: 'github', owner: 'wotstat', repo: 'wotstat-widgets' } },
  { tag: 'wotstat.lootbox-open-multiplier', source: { type: 'github', owner: 'wotstat', repo: 'lootbox-open-multiplier' } },
  { tag: 'izeberg.modssettingsapi', source: { type: 'github', owner: 'izeberg', repo: 'modssettingsapi' } },
  {
    tag: 'me.poliroid.modslistapi-wotstat',
    source: {
      type: 'gitlab-description',
      repo: 'wot-public-mods/mods-list',
      repoId: 26509092
    }
  },
]