# Photography by Calvin Lac

Static photo gallery built with [Eleventy](https://www.11ty.dev/) and [PhotoSwipe](https://photoswipe.com/), deployed to GitHub Pages.

It is a single page: a masonry grid of photos, newest first, that opens into a full-screen lightbox with the camera settings from each photo's EXIF data. Photos are added by dropping files into a folder; everything else (resizing, captions, alt text, ordering) happens at build time.

### Run locally
Requires Node.js 22 or newer (the minimum for `@11ty/eleventy-img`; CI uses Node 24).

1. `npm install`
2. `npm start` - builds and serves at http://localhost:8080 (the first build resizes every photo and takes a few minutes)

`npm run build` writes the site to `_site/` without serving it.

### Add or remove photos
Drop exported JPEGs into `photos/originals/` (or delete them from there), then commit and push.

The build creates web-sized AVIF/WebP versions, reads EXIF for captions and alt text, and orders photos newest first by capture date. Originals stay in the repo but are not published.

### Deploy
Pushing to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml). In the repo settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

Link to a single photo with `#<filename>`, e.g. `#1DSC01801`.

---

## Maintainer guide

### How it works

```
photos/originals/*.jpg ──► src/_data/photos.js ──► _site/img/*.avif|webp   (resized images)
                               │
                               └─ returns `photos` (URLs, sizes, EXIF caption, crop info)
src/_data/site.json ───────────┐                │
                               ▼                ▼
                         src/index.njk ──► _site/index.html
src/css/, src/js/, PhotoSwipe from node_modules ──► _site/css/, _site/js/   (copied as-is)

In the browser: src/js/gallery.js lays out the masonry columns and runs the lightbox.
```

1. **Data** - Eleventy loads every file in `src/_data/` as global template data.
   - `site.json` → `site`: page title, description, author and About text.
   - `photos.js` → `photos`: for each image in `photos/originals/` it
     - generates grid thumbnails (480 and 960px wide, AVIF + WebP) and lightbox images (1280 and 2048px wide, WebP) into `_site/img/` using `@11ty/eleventy-img` (which uses `sharp`); images are never upscaled,
     - reads EXIF (`exifr`) for the capture date, camera, lens, focal length, aperture, shutter speed and ISO, which become the caption, the date label and generated alt text,
     - analyses the 480px thumbnail with `sharp` for a dominant colour (placeholder background) and for a white frame added in editing, which the grid crops off (the lightbox still shows the whole image),
     - deletes any file in `_site/img/` that wasn't produced by this build,
     - returns the list sorted by capture date, newest first (photos without an EXIF date go last).
2. **Template** - `src/index.njk` renders `_site/index.html`: header, About dialog and one `<a class="photo">` tile per photo. Each tile links to the largest image and carries everything the script needs in `data-*` attributes. Without JavaScript the page still works: CSS columns lay the tiles out and clicking opens the image.
3. **Assets** - `eleventy.config.js` copies `src/css/`, `src/js/` and PhotoSwipe's prebuilt files from `node_modules/photoswipe/dist/` into `_site/`. There is no bundler.
4. **Browser** - `src/js/gallery.js`:
   - fades thumbnails in as they load,
   - re-arranges the tiles into 1–4 flex columns, always adding the next photo to the shortest column, so the newest photos are across the top (plain CSS columns would put them down the first column),
   - opens PhotoSwipe on click, with a caption bar showing the EXIF line and date,
   - updates the URL to `#<photo id>` while the lightbox is open and opens the matching photo when the page is loaded with such a hash,
   - starts downloading the lightbox image when a mouse hovers a tile,
   - opens and closes the About dialog.

Every source file has a header comment with more detail.

### Directory layout

| Path | What it is |
| --- | --- |
| `photos/originals/` | Source photos (full-resolution exports). Not published. |
| `src/` | Eleventy input directory. |
| `src/_data/site.json` | Site text (see [Configuration](#configuration)). |
| `src/_data/photos.js` | Image pipeline; produces `_site/img/` and the `photos` data. |
| `src/index.njk` | The page template (Nunjucks). |
| `src/js/gallery.js` | Client-side masonry, lightbox, deep links, About dialog. |
| `src/css/site.css` | All site styles. |
| `eleventy.config.js` | Eleventy config: input/output dirs, copied assets, watched folders. |
| `.github/workflows/deploy.yml` | Build and deploy to GitHub Pages. |
| `_site/` | Build output (git-ignored). `_site/img/` is reused between builds as an image cache. |
| `.vscode/settings.json` | Editor settings only. |

### npm scripts and dependencies

From `package.json` (`"type": "module"`, so all `.js` files are ES modules):

| Script | Command | Use |
| --- | --- | --- |
| `npm start` | `eleventy --serve` | Dev server on http://localhost:8080 with live reload. Rebuilds on changes in `src/` and `photos/originals/`. |
| `npm run build` | `eleventy` | One-off build into `_site/`. This is what CI runs. |

All dependencies are `devDependencies`, used only at build time:

| Package | Used for |
| --- | --- |
| `@11ty/eleventy` | Static site generator. |
| `@11ty/eleventy-img` | Resizing and AVIF/WebP conversion, with output caching. |
| `sharp` | Image analysis in `photos.js` (border trim, dominant colour); also eleventy-img's engine. |
| `exifr` | Reading EXIF metadata. |
| `photoswipe` | Lightbox. Its `dist/` files are copied into the site and loaded in the browser. |

### Configuration

**`src/_data/site.json`** (plain JSON, no comments allowed):

| Field | Where it appears |
| --- | --- |
| `title` | `<title>` of the page. |
| `description` | `<meta name="description">`. |
| `author` | Header title (followed by "Photography") and footer copyright. |
| `about.heading` | Heading of the About dialog. |
| `about.bio` | Text of the About dialog (plain text; HTML is escaped). |

There are no environment variables. Other settings live in code:

| Setting | Where |
| --- | --- |
| Generated widths, formats and quality (AVIF 55, WebP 80) | `src/_data/photos.js` (`imageOptions`, `processPhoto`) |
| Which EXIF tags are read and how the caption is built | `src/_data/photos.js` (`EXIF_TAGS`, `processPhoto`) |
| White-frame detection threshold | `src/_data/photos.js` (`analyzeThumbnail`) |
| Accepted file types (`.jpg .jpeg .png .webp .tif .tiff`) | `src/_data/photos.js` (default export) |
| Column count/width and gap | `src/css/site.css` (`--gap`, `.gallery { columns }`) **and** `src/js/gallery.js` (`MIN_COLUMN_WIDTH`, `GAP`, max 4) **and** the `sizes` attribute in `src/index.njk` |
| Lightbox padding, preloading, background | `src/js/gallery.js` (`padding`, `PhotoSwipeLightbox` options) |
| Colours and fonts | CSS variables at the top of `src/css/site.css` |
| Input/output folders | `eleventy.config.js` (also `OUTPUT_DIR` in `photos.js` and the paths in `deploy.yml`) |

### Adding and removing photos (details)

- Any `.jpg/.jpeg/.png/.webp/.tif/.tiff` file in `photos/originals/` is included; other files are ignored. Sub-folders are not scanned.
- **Ordering** uses EXIF `DateTimeOriginal` (newest first), not the file name. Photos with the same timestamp, or without one, are ordered by file name, descending.
- **The file name (without extension) is the photo's id**: it's the HTML `id` and the deep link (`#1DSC01801`). Renaming a file breaks existing links to it. Keep names unique regardless of extension and use characters that are safe in a URL fragment.
- **Captions** look like `Sony ILCE-6700 · E 27mm F2.8 · f/2.8 · 1/250s · ISO 100`. Missing EXIF values are just left out. If exporting strips EXIF, the caption, date and alt text will be mostly empty and the photo goes to the end of the grid.
- **Dates** are shown exactly as recorded by the camera (no timezone conversion).
- **White frames**: if an export has a white border of at least ~2px on all four sides (measured on the 480px thumbnail), the grid crops it automatically.
- **Replacing a photo** with an edited version under the same name works: the new content gets new image file names and the old ones are deleted on the next build.

### Deployment

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) runs on every push to `main` and can be started by hand from the Actions tab (`workflow_dispatch`).

1. **build** job: checkout → Node 24 → `npm ci` → restore the `_site/img` cache → `npm run build` → upload `_site/` as the Pages artifact.
2. **deploy** job: publishes that artifact with `actions/deploy-pages` to the `github-pages` environment.

No secrets are required: the workflow uses the built-in token with `pages: write` and `id-token: write`. Pages must be set to deploy from **GitHub Actions** (see [Deploy](#deploy)). Only one deployment runs at a time; newer runs wait rather than cancel it.

**Image cache:** resizing ~170 photos from scratch takes minutes, so `_site/img` is cached between runs. The cache key is a hash of `photos/originals/**`, `src/_data/photos.js` and `package-lock.json`; when it changes, the most recent previous cache is restored and only new or changed images are generated. Stale images are removed by `photos.js` before upload, so deleted photos don't stay online. To force a full regeneration, delete the caches in the repo's **Actions → Caches** page.

All URLs in the page are relative, so the site works both at a domain root and under a project path like `https://<user>.github.io/<repo>/`.

### Common modifications

- **Change site text** - edit `src/_data/site.json`.
- **Change colours/fonts** - edit the variables in `:root` in `src/css/site.css` (keep `theme-color` in `src/index.njk` in step with `--bg`).
- **Change the number or width of columns** - update all three places listed under [Configuration](#configuration); `gallery.js` and the CSS must agree, and the `sizes` breakpoints should roughly match where the column count changes.
- **Change image sizes/quality/formats** - edit `processPhoto`/`imageOptions` in `src/_data/photos.js`. All images are regenerated on the next build (new options → new hashes → new file names; the old files are deleted). If you add a grid format, add a matching `<source>` in `src/index.njk`.
- **Change the caption** - edit the `caption` array in `processPhoto` (add any new tag to `EXIF_TAGS` first). The lightbox layout is `.pswp__caption` in `site.css`.
- **Turn off frame cropping** - make `analyzeThumbnail` never return `border` (e.g. require a larger minimum in `hasBorder`); the template and CSS fall back to showing the full image.
- **Update PhotoSwipe** - bump it in `package.json`. The copied file names in `eleventy.config.js`, the `import` paths in `gallery.js` and the `<link>`s in `index.njk` must keep matching.
- **Add another page** - add a template to `src/`. Note that `photos.js` runs once per build regardless of how many pages use it.

### Troubleshooting

- **First build is slow** - expected; every original is resized. Later builds reuse `_site/img/`. Deleting `_site/` forces a full rebuild.
- **`npm start` doesn't show a new photo** - the watcher covers `photos/originals/`; if a change is missed, restart the server.
- **Build fails with `ENOENT ... _site/img`** - happens when `photos/originals/` contains no supported images, so no image folder was created. Add a photo.
- **Build fails on one image** - eleventy-img/sharp can't read it (corrupt file or unsupported format/colour space). Re-export it as JPEG.
- **A photo is in the wrong place** - check its EXIF `DateTimeOriginal`; photos without it sort to the end.
- **Something you put in `_site/img/` disappeared** - that folder is managed by `photos.js`, which deletes anything it didn't generate. Don't put other files there.
- **Pages deploy fails with a permissions/environment error** - check that Pages' source is "GitHub Actions" and that the `github-pages` environment doesn't have protection rules blocking `main`.
- **Tiles show only their placeholder colour, or clicks open the raw image** - `gallery.js` failed to run (with JS enabled, thumbnails stay hidden until it marks them loaded). Check the browser console; a common cause is a 404 for `js/photoswipe-*.esm.min.js` after renaming the copied files.

### License

GPL-3.0, see [LICENSE](LICENSE).
