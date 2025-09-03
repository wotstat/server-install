
type ModsTags =
  'wotstat.analytics' |
  'wotstat.positions' |
  'wotstat.widgets' |
  'wotstat.lootbox-open-multiplier' |
  'wotstat.data-provider' |
  'me.poliroid.modslistapi' |
  'izeberg.modssettingsapi' |
  'net.openwg.gameface' |
  'panikaxa.lesta.quick_demount' |
  'panikaxa.wot.quick_demount'

export type SaveTarget = 'wot-only' | 'mt-only'

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
  target?: SaveTarget
  source?: ModSource,
}


export const mods: Mod[] = [
  { tag: 'panikaxa.lesta.quick_demount' },
  { tag: 'panikaxa.wot.quick_demount' },
  { tag: 'wotstat.analytics', source: { type: 'github', owner: 'wotstat', repo: 'wotstat-analytics' } },
  { tag: 'wotstat.positions', source: { type: 'github', owner: 'wotstat', repo: 'wotstat-positions' } },
  { tag: 'wotstat.widgets', source: { type: 'github', owner: 'wotstat', repo: 'wotstat-widgets' } },
  { tag: 'wotstat.data-provider', source: { type: 'github', owner: 'wotstat', repo: 'wotstat-data-provider' } },
  { tag: 'wotstat.lootbox-open-multiplier', source: { type: 'github', owner: 'wotstat', repo: 'lootbox-open-multiplier' } },
  { tag: 'izeberg.modssettingsapi', source: { type: 'github', owner: 'izeberg', repo: 'modssettingsapi' } },
  {
    tag: 'me.poliroid.modslistapi',
    target: 'wot-only',
    source: {
      type: 'gitlab-description',
      repo: 'wot-public-mods/mods-list',
      repoId: 26509092
    }
  },
  {
    tag: 'net.openwg.gameface',
    target: 'wot-only',
    source: {
      type: 'gitlab-description',
      repo: 'openwg/wot.gameface',
      repoId: 68695173
    }
  },
]