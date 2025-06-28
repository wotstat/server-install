import { mods, type ModSource } from "./mods";
import { XMLParser } from 'fast-xml-parser';
import unzipper from 'unzipper'
import { Database } from "bun:sqlite";

const parser = new XMLParser();
const hasher = new Bun.CryptoHasher("sha256");


type ModSchema = {
  tag: string
  id: string
  version: string | null
  extension: 'mtmod' | 'wotmod'
  hash: string
  filename: string
  url: string
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
  primary key (tag, id, extension)
)`);

const insertModQuery = ModsDB.query<{}, ModCreateSchema>(`
  insert or replace into Mods (tag, id, version, extension, hash, filename, url, date)
  values ($tag, $id, $version, $extension, $hash, $filename, $url, datetime('now'))`
)
const getModQuery = ModsDB.query<ModSchema, { $tag: string, $hash: string, $extension: 'mtmod' | 'wotmod' }>(
  `select * from Mods where tag = $tag and extension = $extension and hash = $hash`
)
const getModsQuery = ModsDB.query<ModSchema, {}>(`select * from Mods`)

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

function modAssetPrepare(name: string, url: string) {
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

function assetsToGame(assets: NonNullable<ReturnType<typeof modAssetPrepare>>[]) {
  const mt = assets.filter(asset => asset.game === 'mtmod').sort((a, b) => compareVersions(a.nameVersion, b.nameVersion)).at(-1);
  const wot = assets.filter(asset => asset.game === 'wotmod').sort((a, b) => compareVersions(a.nameVersion, b.nameVersion)).at(-1);

  return { mt, wot };
}

async function loadGithubLatestReleaseInfo(owner: string, repo: string) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);

  if (!response.ok) throw new Error(`Failed to fetch latest release info for ${owner}/${repo}`);

  const data = await response.json() as GitHubRelease
  const assets = data.assets
    .map(asset => modAssetPrepare(asset.name, asset.browser_download_url))
    .filter(t => t !== null)

  return assetsToGame(assets);
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

async function loadGitlabLatestReleaseInfoFromDescription(repoId: number) {
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

  return assetsToGame(assets);
}

async function downloadModFile(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download mod file from ${url}`);

  const blob = await response.blob();
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

async function saveModFile(file: NonNullable<Awaited<ReturnType<typeof loadModFile>>>, tag: string, extension: 'mtmod' | 'wotmod') {

  const url = `mods/${tag}/${file.hash}/${file.withoutExtName}.${extension}`
  const path = `./store/${url}`;

  if (!(await Bun.file(path).exists())) {
    await Bun.write(path, file.blob as any);
    console.log(`Mod file saved: ${tag}: ${file.withoutExtName}.${extension} (${file.hash})`);
  }

  const existingMod = getModQuery.get({ $tag: tag, $extension: extension, $hash: file.hash });
  if (!existingMod) {
    insertModQuery.run({
      $tag: tag,
      $id: file.id,
      $version: file.version,
      $extension: extension,
      $hash: file.hash,
      $filename: file.fullName,
      $url: url
    });
  }

}

async function loadMod(assets: ReturnType<typeof assetsToGame>) {
  const mtMod = assets.mt ? await loadModFile(assets.mt) : null;
  const wotMod = assets.wot ? await loadModFile(assets.wot) : null;
  return { mtMod, wotMod }
}

async function saveMod(mod: Awaited<ReturnType<typeof loadMod>>, tag: string) {

  const { mtMod, wotMod } = mod;

  if (!mtMod && !wotMod) {
    console.log(`No mod files found for tag: ${tag}`);
    return null;
  }

  await saveModFile(mtMod ? mtMod : wotMod!, tag, 'mtmod')
  await saveModFile(wotMod ? wotMod : mtMod!, tag, 'wotmod')
}


const strategy = {
  'gitlab-description': async (tag: string, source: ModSource & { type: 'gitlab-description' }) => {
    const assets = await loadGitlabLatestReleaseInfoFromDescription(source.repoId);
    const modFile = await loadMod(assets);
    await saveMod(modFile, tag);
  },
  'github': async (tag: string, source: ModSource & { type: 'github' }) => {
    const assets = await loadGithubLatestReleaseInfo(source.owner, source.repo);
    const modFile = await loadMod(assets);
    await saveMod(modFile, tag);
  },
} as const;

export async function loadTask() {

  console.log('Loading mods...');

  for (const mod of mods) {
    if (!mod.source) continue;

    const modStrategy = strategy[mod.source.type];
    await modStrategy(mod.tag, mod.source as any);
  }

  console.log('Mods loaded successfully');
}