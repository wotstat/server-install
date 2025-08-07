import { Hono } from 'hono'
import { getLatestMods, getMods } from './mods-loader'
import { schedule } from "node-cron";

const app = new Hono()

type GameVersion = { version: string, modsFolder: string, actual: string }
let latestLestaGameVersion: GameVersion | null = null
let latestWargamingGameVersion: GameVersion | null = null

async function updateVersions() {
  const response = await fetch('https://db.wotstat.info/?user=public', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: `
      select region, modsFolderName, gameVersionFull, datetime
      from WOT.GameVersionsLatest
      where region in ['EU', 'RU']
      format JSON
    `,
  })

  const { data } = (await response.json()) as {
    data: {
      region: string,
      modsFolderName: string,
      gameVersionFull: string,
      datetime: string,
    }[]
  }

  const euVersion = data.find(d => d.region === 'EU')
  const ruVersion = data.find(d => d.region === 'RU')

  if (!data || !data.length || !euVersion || !ruVersion) {
    console.error('Failed to fetch game versions');
    return;
  }

  latestLestaGameVersion = { version: ruVersion.gameVersionFull, modsFolder: ruVersion.modsFolderName, actual: ruVersion.datetime }
  latestWargamingGameVersion = { version: euVersion.gameVersionFull, modsFolder: euVersion.modsFolderName, actual: euVersion.datetime }
}

updateVersions()
schedule('*/5 * * * *', async () => {
  await updateVersions()
});

app.get('/latest-game-version', c => {
  return c.json({
    lesta: latestLestaGameVersion,
    wargaming: latestWargamingGameVersion,
  })
})


app.get('/mods', c => {
  return c.json(getMods())
})

app.get('/mods-latest', c => {
  return c.json(getLatestMods())
})

export default app