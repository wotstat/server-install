
type ModsTags =
  'wotstat.analytics' |
  'wotstat.positions' |
  'wotstat.widgets' |
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
  {
    tag: 'wotstat.analytics',
    source: {
      type: 'github',
      owner: 'wotstat',
      repo: 'wotstat-analytics'
    }
  },
  { tag: 'wotstat.positions', },
  { tag: 'wotstat.widgets', },
  {
    tag: 'me.poliroid.modslistapi-wotstat',
    source: {
      type: 'gitlab-description',
      repo: 'wot-public-mods/mods-list',
      repoId: 26509092
    }
  },
  {
    tag: 'izeberg.modssettingsapi',
    source: {
      type: 'github',
      owner: 'izeberg',
      repo: 'modssettingsapi'
    }
  }
]