import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(root, "public", "assets", "laptop");
const output = path.join(root, "src", "systems", "personal-laptop", "assets.generated.json");

const formats = {
  songs: new Map([[".mp3", "audio/mpeg"], [".wav", "audio/wav"], [".ogg", "audio/ogg"]]),
  images: new Map([[".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"], [".gif", "image/gif"]]),
  wallpaper: new Map([[".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"]]),
  documents: new Map([[".md", "text/markdown"], [".txt", "text/plain"]])
};

function titleFromFile(fileName) {
  return path.basename(fileName, path.extname(fileName))
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function encodePath(fileName) {
  return fileName.split(/[\\/]/).map(encodeURIComponent).join("/");
}

async function indexFolder(folder, baseUrl, acceptedFormats) {
  const fullPath = path.join(assetRoot, folder);
  let entries = [];
  try {
    entries = await readdir(fullPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  return entries
    .filter(entry => entry.isFile() && acceptedFormats.has(path.extname(entry.name).toLowerCase()))
    .map(entry => {
      const extension = path.extname(entry.name).toLowerCase();
      return {
        id: `${folder}/${entry.name}`,
        fileName: entry.name,
        title: titleFromFile(entry.name),
        url: `${baseUrl}${encodePath(entry.name)}`,
        mimeType: acceptedFormats.get(extension),
        extension: extension.slice(1)
      };
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: "base" }));
}

const manifest = {
  songs: await indexFolder("songs", "/assets/laptop/songs/", formats.songs),
  images: await indexFolder("images", "/assets/laptop/images/", formats.images),
  wallpapers: await indexFolder("wallpaper", "/assets/laptop/wallpaper/", formats.wallpaper),
  documents: await indexFolder("documents", "/assets/laptop/documents/", formats.documents)
};

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Laptop asset manifest: ${manifest.songs.length} songs, ${manifest.images.length} images, ${manifest.wallpapers.length} wallpapers, ${manifest.documents.length} documents.`);
