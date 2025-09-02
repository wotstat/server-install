import { Hono } from 'hono'
import { sign as jwtSign, verify as jwtVerify } from 'hono/jwt'
import { getLatestMod, getLatestMods, getMod, getMods, hasher, modAssetPrepare, prepareModFile, saveMod } from './mods-loader'
import { schedule } from "node-cron";
import { readFileSync } from 'fs'
import { join } from 'path'

const uploadHtml = readFileSync(join(__dirname, 'upload.html'), 'utf-8')

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
// every 5 minutes
schedule('*/5 * * * *', async () => {
  await updateVersions()
});

app.get('/latest-game-version', c => {
  return c.json({
    lesta: latestLestaGameVersion,
    wargaming: latestWargamingGameVersion,
  })
})

// console.log(await jwtSign({ mod: 'me.poliroid.modslistapi' }, Bun.env.JWT_SECRET as string));

app.post('/upload', async c => {
  const formData = await c.req.formData()
  const modFile = formData.get('mod') as File | null
  const nameTag = formData.get('name-tag') as string | null
  const canary = formData.get('canary') as string | null
  const target = formData.get('target') as string | null
  const token = formData.get('token') as string | null

  if (!modFile) return c.json({ error: 'No file uploaded' }, 400)
  if (!nameTag) return c.json({ error: 'No name tag provided' }, 400)
  if (target !== 'mt-only' && target !== 'wot-only' && target !== 'any') return c.json({ error: 'Invalid target provided' }, 400)
  if (!token) return c.json({ error: 'No token provided' }, 400)

  try {
    const t = await jwtVerify(token, Bun.env.JWT_SECRET as string)
    if (!t.mod || t.mod == '') return c.json({ error: 'Invalid token data' }, 401)
    if (t.mod !== nameTag) return c.json({ error: `Invalid token data, expected ${nameTag} but got ${t.mod}` }, 401)
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  const mod = await prepareModFile(modFile)
  const hash = hasher.update(await mod.asset.arrayBuffer()).digest('hex');

  const asset = modAssetPrepare(modFile.name, hash)

  if (!asset) return c.json({ error: 'Invalid mod file' }, 400)

  const modAsset = {
    blob: mod.asset,
    nameTag: nameTag,
    id: mod.id ?? nameTag,
    version: mod.version,
    hash,
    fullName: asset.fullName,
    withoutExtName: asset.withoutExtName,
  }

  console.log('Saving mod:', { mtMod: modAsset, wotMod: null }, nameTag, canary ? Number.parseFloat(canary) : null, target == 'any' ? undefined : target);

  await saveMod({ mtMod: modAsset, wotMod: null }, nameTag, canary ? Number.parseFloat(canary) : null, target == 'any' ? undefined : target)
  return c.json({ success: true })
})

app.get('/upload', c => {
  return c.body(uploadHtml, 200, { 'Content-Type': 'text/html' })
})

app.get('/mods', c => {
  return c.json(getMods())
})

app.get('/mods/latest', c => {
  return c.json(getLatestMods())
})

// deprecated
app.get('/mods-latest', c => {
  return c.json(getLatestMods())
})

app.get('/mod/:tag', c => {
  return c.json(getMod(c.req.param('tag')))
})

app.get('/mod/:tag/latest', c => {
  return c.json(getLatestMod(c.req.param('tag')))
})

export default app