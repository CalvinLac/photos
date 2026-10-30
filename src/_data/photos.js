/**
 * Global data file: exposes `photos` to every template (used by src/index.njk).
 *
 * This is the image pipeline. For each original in photos/originals/ it:
 *   - writes resized copies to _site/img/ with @11ty/eleventy-img (sharp under the hood):
 *       grid thumbnails: 480px + 960px wide, AVIF + WebP  -> <picture> in the gallery grid
 *       lightbox images: 1280px + 2048px wide, WebP       -> PhotoSwipe srcset
 *   - reads EXIF with exifr to build the caption, alt text and capture date,
 *   - inspects the 480px thumbnail with sharp to find a dominant colour (placeholder
 *     background) and any white frame baked into the export (so the grid can crop it),
 *   - deletes anything in _site/img/ that this run didn't produce,
 *   - returns all photos sorted newest first.
 *
 * Paths are relative to the project root, which is the cwd when running `npm run build`/`npm start`.
 * Originals are never copied to _site/, so they are not published.
 *
 * Speed: eleventy-img names outputs by a hash of the source file and options and skips any
 * output that already exists on disk. Re-builds (and CI, which caches _site/img) therefore only
 * process new or edited photos. Changing widths, formats or quality changes the hash, so every
 * photo is regenerated on the next build.
 *
 * The shape of each returned object is documented on `processPhoto` below; src/index.njk
 * is the only consumer.
 */
import fs from "node:fs/promises";
import path from "node:path";
import Image from "@11ty/eleventy-img";
import exifr from "exifr";
import sharp from "sharp";

const SOURCE_DIR = "photos/originals";
// Must stay inside Eleventy's output dir (eleventy.config.js). Treat it as build-owned: the
// clean-up step at the bottom deletes every file in here that this build didn't generate.
const OUTPUT_DIR = "_site/img";

// Shared eleventy-img options; `widths`/`formats` are supplied per call in processPhoto.
// `urlPath` is relative (no leading slash) so the site works from a sub-path such as
// https://<user>.github.io/<repo>/ without configuring a path prefix.
// Output names look like `<original name>-<hash>-<width>.<format>`, e.g. 1DSC01801-AbCd12-480.avif.
const imageOptions = {
  outputDir: OUTPUT_DIR,
  urlPath: "img/",
  filenameFormat: (hash, src, width, format) => `${path.parse(src).name}-${hash}-${width}.${format}`,
  sharpWebpOptions: { quality: 80 },
  sharpAvifOptions: { quality: 55 },
};

// Only these tags are parsed (faster than reading the whole EXIF block). Add a tag here before
// using it in processPhoto.
const EXIF_TAGS = ["Make", "Model", "LensModel", "FocalLength", "FNumber", "ExposureTime", "ISO", "DateTimeOriginal"];

// Capture times are camera wall-clock time; keep them in UTC so the build machine's timezone can't shift the date.
const dateFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Parse a raw EXIF date string. exifr is called with `reviveValues: false`, so dates arrive as
 * "YYYY:MM:DD HH:MM:SS" strings with no timezone; they're read as UTC on purpose (see dateFormat).
 * @param {string | undefined} value e.g. "2025:03:31 14:05:09"
 * @returns {Date | undefined} undefined when the photo has no DateTimeOriginal
 */
function parseExifDate(value) {
  if (!value) return;
  const [year, month, day, hour, minute, second] = value.split(/[: ]/).map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

/**
 * Build a readable camera name from EXIF Make/Model.
 * Some makers repeat the brand in Model, others don't, and Make is often upper-case or long:
 *   ("Canon", "Canon EOS R5")              -> "Canon EOS R5"   (model already has the brand)
 *   ("FUJIFILM", "X-T5")                   -> "Fujifilm X-T5"
 *   ("SONY", "ILCE-7M3")                   -> "Sony ILCE-7M3"
 *   ("NIKON CORPORATION", "NIKON Z 6")     -> "NIKON Z 6"      (only the first word of Make is used)
 * Missing Make returns Model unchanged; missing both returns "".
 * @param {string} [make]
 * @param {string} [model]
 * @returns {string}
 */
function cameraName(make = "", model = "") {
  const brand = make.split(" ")[0];
  if (model.toLowerCase().startsWith(brand.toLowerCase())) return model;
  return `${brand.charAt(0)}${brand.slice(1).toLowerCase()} ${model}`.trim();
}

/**
 * Format EXIF ExposureTime (seconds) the way cameras show it: 0.004 -> "1/250s", 2 -> "2s".
 * @param {number | undefined} seconds
 * @returns {string | undefined} undefined when missing, so it's dropped from the caption
 */
function shutterSpeed(seconds) {
  if (!seconds) return;
  return seconds >= 1 ? `${seconds}s` : `1/${Math.round(1 / seconds)}s`;
}

// Join eleventy-img entries of one format into a srcset string: "a-480.webp 480w, a-960.webp 960w".
const srcset = (entries) => entries.map((entry) => entry.srcset).join(", ");

// Round to 3 decimals to keep the inline CSS values short.
const round = (n) => Math.round(n * 1000) / 1000;

/**
 * Find a white frame added in post so the grid can crop it; the lightbox still shows the full image.
 * Also picks the placeholder colour shown while the thumbnail loads.
 *
 * sharp's trim() removes near-white (#ffffff, threshold 20) edges; comparing the trimmed size and
 * offsets with the original gives the frame width on each side. It only counts as a frame when
 * all four sides are at least 2px, so photos that merely have a bright sky or edge aren't cropped.
 *
 * The `border` values are consumed as CSS in src/index.njk / src/css/site.css: the tile gets the
 * aspect ratio of `crop`, and the <img> inside is enlarged to `scale`% of the tile width and
 * shifted up/left by `x`/`y`% with overflow hidden, which hides the frame. All three are
 * percentages of the *crop width* — including `y` — because CSS percentage margins (even
 * margin-top) resolve against the containing block's width. Only ratios are used, so measuring
 * on the small thumbnail is fine for every display size.
 *
 * @param {string} file path to the generated 480px WebP thumbnail
 * @returns {Promise<{
 *   color: string,                                   // dominant colour, e.g. "rgb(34 51 68)"
 *   crop: { width: number, height: number },         // visible area in thumbnail px (whole image if no frame)
 *   border?: { scale: number, x: number, y: number } // only present when a frame was found
 * }>}
 */
async function analyzeThumbnail(file) {
  const { width, height } = await sharp(file).metadata();
  const trimmed = await sharp(file).trim({ background: "#ffffff", threshold: 20 }).toBuffer({ resolveWithObject: true });
  // trimOffsetLeft/Top are negative (offset of the trimmed area from the original's origin);
  // the right/bottom widths are whatever is left over.
  const left = -trimmed.info.trimOffsetLeft;
  const top = -trimmed.info.trimOffsetTop;
  const right = width - trimmed.info.width - left;
  const bottom = height - trimmed.info.height - top;
  const hasBorder = Math.min(left, top, right, bottom) >= 2;

  // Measure the colour without the frame, otherwise framed photos would all get a white placeholder.
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

/**
 * Generate all derivatives for one original and describe it for the template.
 *
 * Note: eleventy-img never upscales, so an original narrower than a requested width produces
 * fewer/smaller files; the code below always uses the first/last entry rather than fixed sizes.
 *
 * @param {string} file file name inside SOURCE_DIR, e.g. "1DSC01801.jpg"
 * @param {Set<string>} outputs side effect: every generated file name is added, so the caller
 *   knows which files in OUTPUT_DIR are still in use
 * @returns {Promise<object>} the photo record used by src/index.njk:
 *   id        file name without extension; becomes the tile's HTML id and the `#<id>` deep link
 *   timestamp capture time in ms (0 when there is no EXIF date) — sort key only
 *   date      formatted capture date, e.g. "Mar 31, 2025" ("" when unknown)
 *   alt       generated alt text, e.g. "Photograph taken Mar 31, 2025 on Fujifilm X100VI"
 *   caption   EXIF line shown in the lightbox, parts joined with " · "
 *   color     placeholder background colour (see analyzeThumbnail)
 *   crop      { width, height } used for the tile aspect ratio and masonry balancing
 *   border    optional { scale, x, y } frame-crop values (see analyzeThumbnail)
 *   grid      { avif, webp, src, width, height } — thumbnail srcsets + 480px fallback <img>
 *   full      { src, srcset, width, height } — largest WebP + srcset for PhotoSwipe
 */
async function processPhoto(file, outputs) {
  const src = path.join(SOURCE_DIR, file);
  // `exif = {}`: exifr resolves to undefined when a file has no EXIF, which would break the
  // property reads below.
  const [grid, full, exif = {}] = await Promise.all([
    Image(src, { ...imageOptions, widths: [480, 960], formats: ["avif", "webp"] }),
    Image(src, { ...imageOptions, widths: [1280, 2048], formats: ["webp"] }),
    exifr.parse(src, { pick: EXIF_TAGS, reviveValues: false }),
  ]);

  for (const entry of [...grid.avif, ...grid.webp, ...full.webp]) {
    outputs.add(path.basename(entry.outputPath));
  }

  // eleventy-img returns entries sorted by width ascending: [0] is the 480px thumbnail used as the
  // <img> fallback and for analysis, .at(-1) the biggest lightbox image (also the tile's href).
  const thumb = grid.webp[0];
  const largest = full.webp.at(-1);
  const { color, crop, border } = await analyzeThumbnail(thumb.outputPath);

  const date = parseExifDate(exif.DateTimeOriginal);
  const camera = cameraName(exif.Make, exif.Model);
  // Treat an empty or dashes-only LensModel (written by some bodies for unknown/manual lenses) as missing.
  const lens = /^-*$/.test(exif.LensModel ?? "") ? undefined : exif.LensModel;
  // e.g. "Fujifilm X100VI · 23mm · f/2 · 1/250s · ISO 125". Missing values become falsy and are
  // filtered out, so the separator never doubles up.
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

/**
 * Entry point called by Eleventy (once per build, and again on every rebuild in `npm start`).
 * The returned array is available to templates as `photos`.
 *
 * Side effects: writes images to OUTPUT_DIR and deletes stale ones from it.
 * All photos are started at once; eleventy-img queues the actual resizing internally.
 *
 * @returns {Promise<object[]>} photo records (see processPhoto), newest capture first; photos
 *   without an EXIF date sort last. Ties are broken by id, descending, so the order is stable.
 */
export default async function () {
  const outputs = new Set();
  // Supported extensions; anything else in the folder (e.g. .DS_Store, sidecar files) is ignored.
  const files = (await fs.readdir(SOURCE_DIR)).filter((file) => /\.(jpe?g|png|webp|tiff?)$/i.test(file));
  const photos = await Promise.all(files.map((file) => processPhoto(file, outputs)));

  // Drop derivatives of removed or re-edited photos so a restored CI cache can't republish them.
  // (A re-edited photo gets a new content hash, hence new file names, so its old files become stale.)
  // Runs after all processing, by which point eleventy-img has created OUTPUT_DIR — unless
  // SOURCE_DIR has no images, in which case readdir throws on a clean checkout.
  for (const name of await fs.readdir(OUTPUT_DIR)) {
    if (!outputs.has(name)) await fs.rm(path.join(OUTPUT_DIR, name));
  }

  return photos.sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
}
