import { mods, type ModSource, type SaveTarget } from "./mods";
import { XMLParser } from 'fast-xml-parser';
import unzipper from 'unzipper'
import { Database } from "bun:sqlite";
import { rm } from "node:fs/promises";

const parser = new XMLParser();
export const hasher = new Bun.CryptoHasher("sha256");


type ModSchema = {
  tag: string
  id: string
  version: string | null
  extension: 'mtmod' | 'wotmod'
  hash: string
  filename: string
  url: string
  canaryPublish: string | null
  canaryPercent: number | null
  date: string
}

type ModCreateSchema = {
  $tag: string
  $id: string
  $version: string | null
  $extension: 'mtmod' | 'wotmod'
  $hash: string
  $filename: string
  $url: string
  $canaryPublish: string | null
  $canaryPercent: number | null
}

const ModsDB = new Database('./store/mods.sqlite', { create: true })
ModsDB.exec(`create table if not exists Mods (
  tag text not null,
  id text not null,
  version text,
  extension text not null,
  hash text not null,
  filename text not null,
  url text not null,
  date datetime not null default (datetime('now')),
  canaryPublish datetime default null,
  canaryPercent decimal default null,
  primary key (tag, id, extension)
)`);

const insertModQuery = ModsDB.query<{}, ModCreateSchema>(`
  insert or replace into Mods (tag, id, version, extension, hash, filename, url, date, canaryPublish, canaryPercent)
  values ($tag, $id, $version, $extension, $hash, $filename, $url, datetime('now'), $canaryPublish, $canaryPercent)`
)
const updateCanaryPercent = ModsDB.query<{}, { $tag: string, $hash: string, $extension: 'mtmod' | 'wotmod', $canaryPercent: number | null }>(`
  update Mods set canaryPercent = $canaryPercent where tag = $tag and hash = $hash and extension = $extension
`)
const updateCanary = ModsDB.query<{}, { $tag: string, $hash: string, $extension: 'mtmod' | 'wotmod', $canaryPublish: string | null, $canaryPercent: number | null }>(`
  update Mods set canaryPublish = $canaryPublish, canaryPercent = $canaryPercent where tag = $tag and hash = $hash and extension = $extension
`)
const getModQuery = ModsDB.query<ModSchema, { $tag: string, $hash: string, $extension: 'mtmod' | 'wotmod' }>(
  `select * from Mods where tag = $tag and extension = $extension and hash = $hash`
)
const getLatestModsQuery = ModsDB.query<ModSchema, {}>(`
  WITH 
    LatestMods AS (
      SELECT *,
            ROW_NUMBER() OVER (PARTITION BY tag, extension ORDER BY date DESC) AS rn
      FROM Mods
    )
  SELECT *
  FROM LatestMods
  WHERE rn = 1;
`)
const getModsQuery = ModsDB.query<ModSchema, {}>(`select * from Mods order by date DESC`)
const deleteModByTagQuery = ModsDB.query<{}, { $tag: string }>(`delete from Mods where tag = $tag`)


function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const maxLength = Math.max(aParts.length, bParts.length);

  // Normalize both arrays to the same length
  while (aParts.length < maxLength) aParts.push(0);
  while (bParts.length < maxLength) bParts.push(0);

  for (let i = 0; i < maxLength; i++) {
    if (aParts[i]! > bParts[i]!) return 1;
    if (aParts[i]! < bParts[i]!) return -1;
  }

  return 0;
}

type GitHubRelease = {
  tag_name: string;
  body: string;
  assets: {
    name: string;
    browser_download_url: string;
  }[];
}

type GitLabReleases = {
  tag_name: string;
  description: string;
  assets: {
    sources: {
      url: string;
    }[]
  }
}[]

type LoadInfoStrategyResult = {
  assets: ReturnType<typeof modAssets>;
  canary: number | null;
};

export function modAssetPrepare(name: string, url: string) {
  const match = name.match(/^(.*?)_?((?:\d+\.)*(?:\d+))?\.(mtmod|wotmod)$/);

  if (!match || match.length < 4) return null;

  return {
    fullName: name,
    withoutExtName: name.replace(/(\.mtmod|\.wotmod)$/, ''),
    nameTag: match[1] || '',
    nameVersion: match[2] || '',
    game: match[3] as 'mtmod' | 'wotmod',
    url
  };
}

function modAssets(assets: NonNullable<ReturnType<typeof modAssetPrepare>>[]) {
  const mt = assets.filter(asset => asset.game === 'mtmod').sort((a, b) => compareVersions(a.nameVersion, b.nameVersion)).at(-1);
  const wot = assets.filter(asset => asset.game === 'wotmod').sort((a, b) => compareVersions(a.nameVersion, b.nameVersion)).at(-1);

  return { mt, wot };
}

async function loadGithubLatestReleaseInfo(owner: string, repo: string): Promise<LoadInfoStrategyResult> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    headers: {
      'Authorization': `token ${Bun.env.GITHUB_API_TOKEN}`
    }
  });

  if (!response.ok) throw new Error(`Failed to fetch latest release info for ${owner}/${repo}: [${response.statusText}] ${await response.text()}`);

  const data = await response.json() as GitHubRelease

  const match = data.body.match(/`canary_upgrade=(\d+.\d+|\d+)?`/)

  const assets = data.assets
    .map(asset => modAssetPrepare(asset.name, asset.browser_download_url))
    .filter(t => t !== null)

  return {
    assets: modAssets(assets),
    canary: match ? Number(match[1]) : null
  };
}

async function loadGitlabLatestReleaseInfo(repo: string) {
  const response = await fetch(`https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}/releases`);

  if (!response.ok) {
    throw new Error(`Failed to fetch latest release info for ${repo}`);
  }

  const data = await response.json() as GitLabReleases;
  const latestRelease = data.at(0)
  console.log(latestRelease?.assets.sources);
}

async function loadGitlabLatestReleaseInfoFromDescription(repoId: number): Promise<LoadInfoStrategyResult> {
  const response = await fetch(`https://gitlab.com/api/v4/projects/${repoId}/releases`);

  if (!response.ok) throw new Error(`Failed to fetch latest release info for ${repoId}`);

  const data = await response.json() as GitLabReleases;
  const latestRelease = data.at(0)
  const description = latestRelease?.description || '';

  const descriptionMatch = Array.from(description.matchAll(/\[.*\]\(((?:\/uploads\/.*\/)((?:.*?)_?(?:(?:\d+\.)*(?:\d+))?\.(?:mtmod|wotmod)))\)/g));
  const assets = descriptionMatch
    .filter(m => m.length >= 2 && m[1] && m[2])
    .map(m => modAssetPrepare(m[2]!, `https://gitlab.com/-/project/${repoId}${m[1]}`))
    .filter(t => t !== null)

  return {
    assets: modAssets(assets),
    canary: null
  };
}

async function downloadModFile(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download mod file from ${url}`);

  const blob = await response.blob();

  return await prepareModFile(blob as any);
}

export async function prepareModFile(blob: Blob) {
  const folder = await unzipper.Open.buffer(Buffer.from(await blob.arrayBuffer()))

  const metaFile = folder.files.find(file => file.path === 'meta.xml');
  if (metaFile) {
    const metaContent = await metaFile.buffer();
    const metaXml = parser.parse(metaContent.toString('utf-8'));

    return { asset: blob, version: metaXml.root.version, id: metaXml.root.id };
  }

  return { asset: blob, version: null, id: null };
}

async function loadModFile(asset: {
  fullName: string;
  withoutExtName: string;
  nameTag: string;
  nameVersion: string;
  game: "mtmod" | "wotmod";
  url: string;
}) {
  const mod = await downloadModFile(asset.url)
  const hash = hasher.update(await mod.asset.arrayBuffer()).digest('hex');

  return {
    blob: mod.asset,
    nameTag: asset.nameTag,
    id: mod.id ?? asset.nameTag,
    version: mod.version,
    hash,
    fullName: asset.fullName,
    withoutExtName: asset.withoutExtName,
  }
}

async function loadMod(assets: ReturnType<typeof modAssets>) {
  const mtMod = assets.mt ? await loadModFile(assets.mt) : null;
  const wotMod = assets.wot ? await loadModFile(assets.wot) : null;
  return { mtMod, wotMod }
}

async function saveModFile(file: NonNullable<Awaited<ReturnType<typeof loadModFile>>>, tag: string, extension: 'mtmod' | 'wotmod', canaryPercent: number | null) {

  const url = `mods/${tag}/${file.hash}/${file.withoutExtName}.${extension}`
  const path = `./store/${url}`;

  if (!(await Bun.file(path).exists())) {
    await Bun.write(path, file.blob as any);
    console.log(`Mod file saved: ${tag}: ${file.withoutExtName}.${extension} (${file.hash})`);
  }

  const existingMod = getModQuery.get({ $tag: tag, $extension: extension, $hash: file.hash });

  const canaryShouldExist = canaryPercent !== null && canaryPercent !== 0;
  const canaryPublish = canaryShouldExist ? new Date().toISOString() : null;

  if (!existingMod) {
    insertModQuery.run({
      $tag: tag,
      $id: file.id,
      $version: file.version,
      $extension: extension,
      $hash: file.hash,
      $filename: file.fullName,
      $url: url,
      $canaryPublish: canaryPublish,
      $canaryPercent: canaryShouldExist ? canaryPercent : null
    });
    cacheInvalidate();
  } else {

    if (existingMod.canaryPercent == canaryPercent)
      return

    const existingCanary = existingMod.canaryPublish !== null;

    const base = { $tag: tag, $hash: file.hash, $extension: extension };

    if (!existingCanary && canaryShouldExist) {
      updateCanary.run({ ...base, $canaryPublish: canaryPublish, $canaryPercent: canaryPercent });
    } else if (existingCanary && canaryShouldExist) {
      updateCanaryPercent.run({ ...base, $canaryPercent: canaryPercent });
    } else if (existingCanary && !canaryShouldExist) {
      updateCanary.run({ ...base, $canaryPublish: null, $canaryPercent: null });
    }
    cacheInvalidate();
  }
}

async function removeModByTag(tag: string) {
  const url = `./store/mods/${tag}`;
  await rm(url, { recursive: true, force: true });
  deleteModByTagQuery.run({ $tag: tag });
  cacheInvalidate();
}

export async function saveMod(mod: Awaited<ReturnType<typeof loadMod>>, tag: string, canaryPercent: number | null, target?: SaveTarget) {

  const { mtMod, wotMod } = mod;

  if (!mtMod && !wotMod) {
    console.log(`No mod files found for tag: ${tag}`);
    return null;
  }

  if (target !== 'wot-only') await saveModFile(mtMod ? mtMod : wotMod!, tag, 'mtmod', canaryPercent)
  if (target !== 'mt-only') await saveModFile(wotMod ? wotMod : mtMod!, tag, 'wotmod', canaryPercent)
}


const strategy = {
  'gitlab-description': async (tag: string, source: ModSource & { type: 'gitlab-description' }, target?: SaveTarget) => {
    const assets = await loadGitlabLatestReleaseInfoFromDescription(source.repoId);
    const modFile = await loadMod(assets.assets);
    await saveMod(modFile, tag, assets.canary, target);
  },
  'github': async (tag: string, source: ModSource & { type: 'github' }, target?: SaveTarget) => {
    const assets = await loadGithubLatestReleaseInfo(source.owner, source.repo);
    const modFile = await loadMod(assets.assets);
    await saveMod(modFile, tag, assets.canary, target);
  },
} as const;

export async function loadTask() {

  console.log('Loading mods...');

  for (const mod of mods) {
    if (!mod.source) continue;

    try {
      const modStrategy = strategy[mod.source.type];
      await modStrategy(mod.tag, mod.source as any, mod.target);
    } catch (error) {
      console.error(`Error loading mod ${mod.tag} from source ${mod.source.type}: ${error}`);
      console.error(error);
      continue;
    }
  }

  const modsList = getModsQuery.all({})
  const tags = new Set(modsList.map(mod => mod.tag));
  const targetTags = new Set<string>(mods.map(m => m.tag));

  for (const tag of tags) {
    if (targetTags.has(tag)) continue;
    console.log(`Removing mod: ${tag}`);
    await removeModByTag(tag)
  }

  console.log('Mods loaded successfully');
}

type ModVariant = {
  id: string
  version: string | null
  hash: string
  filename: string
  url: string
  date: string
}

function getModVariant(mod: ModSchema) {
  return {
    id: mod.id,
    filename: mod.filename,
    version: mod.version,
    hash: mod.hash,
    url: mod.url,
    date: mod.date.split(' ').at(0) ?? '-',
    canary: mod.canaryPublish !== null && mod.canaryPercent !== null ? {
      publish: mod.canaryPublish,
      percent: mod.canaryPercent
    } : undefined
  }
}

function cacheInvalidate() {
  cacheLatestMods = null;
  cacheMods = null;
}

let cacheLatestMods: Record<string, { mtmod: ModVariant | null; wotmod: ModVariant | null; }> | null = null;
export function getLatestMods() {

  if (cacheLatestMods) return cacheLatestMods;

  const modsList = getLatestModsQuery.all({})

  const modsMap = new Map<string, { mtmod: ModVariant | null, wotmod: ModVariant | null }>();

  for (const mod of modsList) {
    const variant = getModVariant(mod)

    if (modsMap.has(mod.tag)) {
      const existing = modsMap.get(mod.tag)!;
      if (mod.extension === 'mtmod') existing.mtmod = variant
      else if (mod.extension === 'wotmod') existing.wotmod = variant
    }
    else {
      modsMap.set(mod.tag, {
        mtmod: mod.extension === 'mtmod' ? variant : null,
        wotmod: mod.extension === 'wotmod' ? variant : null
      });
    }
  }

  cacheLatestMods = Object.fromEntries(modsMap.entries())
  return cacheLatestMods
}

let cacheMods: Record<string, { mtmod: ModVariant[], wotmod: ModVariant[] }> | null = null;
export function getMods() {

  if (cacheMods) return cacheMods;

  const modsList = getModsQuery.all({})

  const modsMap = new Map<string, { mtmod: ModVariant[], wotmod: ModVariant[] }>();

  for (const mod of modsList) {
    const variant = getModVariant(mod)

    if (!modsMap.has(mod.tag)) {
      modsMap.set(mod.tag, { mtmod: [], wotmod: [] });
    }

    const existing = modsMap.get(mod.tag)!;
    if (mod.extension === 'mtmod') existing.mtmod.push(variant)
    else if (mod.extension === 'wotmod') existing.wotmod.push(variant)
  }

  cacheMods = Object.fromEntries(modsMap.entries())
  return cacheMods
}

export function getMod(tag: string) {
  const mods = getMods();
  return mods[tag] || null;
}

export function getLatestMod(tag: string) {
  const mods = getLatestMods();
  return mods[tag] || null;
}