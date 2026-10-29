import fs from "node:fs/promises";
import path from "node:path";
import Image from "@11ty/eleventy-img";
import exifr from "exifr";
import sharp from "sharp";

const SOURCE_DIR = "photos/originals";
const OUTPUT_DIR = "_site/img";

const imageOptions = {
  outputDir: OUTPUT_DIR,
  urlPath: "img/",
  filenameFormat: (hash, src, width, format) => `${path.parse(src).name}-${hash}-${width}.${format}`,
  sharpWebpOptions: { quality: 80 },
  sharpAvifOptions: { quality: 55 },
};

const EXIF_TAGS = ["Make", "Model", "LensModel", "FocalLength", "FNumber", "ExposureTime", "ISO", "DateTimeOriginal"];

// Capture times are camera wall-clock time; keep them in UTC so the build machine's timezone can't shift the date.
const dateFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

function parseExifDate(value) {
  if (!value) return;
  const [year, month, day, hour, minute, second] = value.split(/[: ]/).map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function cameraName(make = "", model = "") {
  const brand = make.split(" ")[0];
  if (model.toLowerCase().startsWith(brand.toLowerCase())) return model;
  return `${brand.charAt(0)}${brand.slice(1).toLowerCase()} ${model}`.trim();
}

function shutterSpeed(seconds) {
  if (!seconds) return;
  return seconds >= 1 ? `${seconds}s` : `1/${Math.round(1 / seconds)}s`;
}

const srcset = (entries) => entries.map((entry) => entry.srcset).join(", ");

const round = (n) => Math.round(n * 1000) / 1000;

// Find a white frame added in post so the grid can crop it; the lightbox still shows the full image.
async function analyzeThumbnail(file) {
  const { width, height } = await sharp(file).metadata();
  const trimmed = await sharp(file).trim({ background: "#ffffff", threshold: 20 }).toBuffer({ resolveWithObject: true });
  const left = -trimmed.info.trimOffsetLeft;
  const top = -trimmed.info.trimOffsetTop;
  const right = width - trimmed.info.width - left;
  const bottom = height - trimmed.info.height - top;
  const hasBorder = Math.min(left, top, right, bottom) >= 2;

  const { dominant } = await sharp(hasBorder ? trimmed.data : file).stats();
  const color = `rgb(${dominant.r} ${dominant.g} ${dominant.b})`;
  if (!hasBorder) return { color, crop: { width, height } };

  // Inset a little further so resampling at display size can't blend the frame into the edge.
  const inset = 2;
  const crop = { width: trimmed.info.width - 2 * inset, height: trimmed.info.height - 2 * inset };
  return {
    color,
    crop,
    border: {
      scale: round((width / crop.width) * 100),
      x: round(((left + inset) / crop.width) * 100),
      y: round(((top + inset) / crop.width) * 100),
    },
  };
}

async function processPhoto(file, outputs) {
  const src = path.join(SOURCE_DIR, file);
  const [grid, full, exif = {}] = await Promise.all([
    Image(src, { ...imageOptions, widths: [480, 960], formats: ["avif", "webp"] }),
    Image(src, { ...imageOptions, widths: [1280, 2048], formats: ["webp"] }),
    exifr.parse(src, { pick: EXIF_TAGS, reviveValues: false }),
  ]);

  for (const entry of [...grid.avif, ...grid.webp, ...full.webp]) {
    outputs.add(path.basename(entry.outputPath));
  }

  const thumb = grid.webp[0];
  const largest = full.webp.at(-1);
  const { color, crop, border } = await analyzeThumbnail(thumb.outputPath);

  const date = parseExifDate(exif.DateTimeOriginal);
  const camera = cameraName(exif.Make, exif.Model);
  const lens = /^-*$/.test(exif.LensModel ?? "") ? undefined : exif.LensModel;
  const caption = [
    camera,
    lens,
    exif.FocalLength && `${Math.round(exif.FocalLength)}mm`,
    exif.FNumber && `f/${exif.FNumber}`,
    shutterSpeed(exif.ExposureTime),
    exif.ISO && `ISO ${exif.ISO}`,
  ].filter(Boolean).join(" · ");

  return {
    id: path.parse(file).name,
    timestamp: date?.getTime() ?? 0,
    date: date ? dateFormat.format(date) : "",
    alt: ["Photograph", date && `taken ${dateFormat.format(date)}`, camera && `on ${camera}`].filter(Boolean).join(" "),
    caption,
    color,
    crop,
    border,
    grid: {
      avif: srcset(grid.avif),
      webp: srcset(grid.webp),
      src: thumb.url,
      width: thumb.width,
      height: thumb.height,
    },
    full: {
      src: largest.url,
      srcset: srcset(full.webp),
      width: largest.width,
      height: largest.height,
    },
  };
}

export default async function () {
  const outputs = new Set();
  const files = (await fs.readdir(SOURCE_DIR)).filter((file) => /\.(jpe?g|png|webp|tiff?)$/i.test(file));
  const photos = await Promise.all(files.map((file) => processPhoto(file, outputs)));

  // Drop derivatives of removed or re-edited photos so a restored CI cache can't republish them.
  for (const name of await fs.readdir(OUTPUT_DIR)) {
    if (!outputs.has(name)) await fs.rm(path.join(OUTPUT_DIR, name));
  }

  return photos.sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
}
