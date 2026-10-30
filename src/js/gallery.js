/**
 * Progressive enhancement for the gallery page (src/index.njk). Loaded as an ES module, so it runs
 * after the HTML is parsed. Everything here is optional: without JS the page is still a working
 * CSS-columns grid of links to the full-size images.
 *
 * Sections:
 *   1. Fade-in        add .is-loaded to each thumbnail when it has loaded (CSS does the fade)
 *   2. Masonry        re-distribute tiles into flex columns so the newest photos stay at the top
 *   3. Lightbox       PhotoSwipe with an EXIF caption bar and #<photo-id> deep links
 *   4. Prefetch       start downloading the lightbox image when the mouse hovers a tile
 *   5. About dialog   open/close the <dialog id="about">
 *
 * All per-photo data comes from attributes rendered by index.njk on each `a.photo`
 * (id, href, data-ratio, data-pswp-*, data-caption, data-date).
 *
 * The PhotoSwipe files are copied out of node_modules by eleventy.config.js; the import paths
 * below are those copied names, relative to _site/js/.
 */
import PhotoSwipeLightbox from "./photoswipe-lightbox.esm.min.js";

const gallery = document.getElementById("gallery");
// Captured once in newest-first DOM order. layout() later moves these elements into column
// wrappers, so this array (not the DOM order) is the source of truth for photo order and
// lightbox indexes.
const photos = [...gallery.querySelectorAll(".photo")];

// `complete` covers images that finished (or came from cache) before this script ran, which
// would never fire "load". Note that a failed image also counts as complete.

for (const img of gallery.querySelectorAll("img")) {
  if (img.complete) img.classList.add("is-loaded");
  else img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
}

// Masonry: fill the shortest column next so newest photos stay at the top. Matches `columns: 4 300px` in CSS.
const MIN_COLUMN_WIDTH = 300;
const GAP = 8;
let columnCount = 0;

/**
 * Distribute the tiles into `count` flex columns, newest first, each going into the currently
 * shortest column.
 *
 * Column count mirrors the CSS `columns: 4 300px; column-gap: 8px` fallback: at most 4 columns,
 * each at least MIN_COLUMN_WIDTH wide. clientWidth includes the gallery's 8px left/right padding,
 * so n columns fit when clientWidth - 2*GAP >= n*MIN_COLUMN_WIDTH + (n-1)*GAP, which rearranges
 * to the formula below. If you change the gap or column width, update site.css (--gap,
 * `.gallery { columns }`) and the `sizes` breakpoints in index.njk to match.
 *
 * Column heights are tracked as the sum of each tile's height/width ratio (data-ratio). Columns
 * are equally wide, so this is proportional to pixel height without measuring anything (images
 * may not have loaded yet); gaps are ignored.
 *
 * Side effects: replaces #gallery's children with new `div.column` wrappers (the existing tile
 * elements are moved, not cloned, so loaded images and listeners survive) and adds `.is-masonry`,
 * which switches site.css from CSS columns to the flex layout. Called on load and on every
 * resize, but only rebuilds when the column count actually changes.
 */
function layout() {
  const count = Math.min(4, Math.max(1, Math.floor((gallery.clientWidth - GAP) / (MIN_COLUMN_WIDTH + GAP))));
  if (count === columnCount) return;
  columnCount = count;

  const columns = Array.from({ length: count }, () => Object.assign(document.createElement("div"), { className: "column" }));
  const heights = new Array(count).fill(0);
  for (const photo of photos) {
    // indexOf returns the leftmost on ties, so the first `count` photos form the top row left to right.
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest].append(photo);
    heights[shortest] += Number(photo.dataset.ratio);
  }
  gallery.replaceChildren(...columns);
  gallery.classList.add("is-masonry");
}

layout();
addEventListener("resize", layout);

// Lightbox

/**
 * Space PhotoSwipe leaves around the image. Phones (viewport < 600px) go edge to edge and the
 * caption overlays the image (see the max-width: 599px rule in site.css); larger screens keep a
 * margin, with 64px at the bottom for the caption bar. Also reused by the hover prefetch below so
 * it predicts the same image size PhotoSwipe will display.
 * @param {{ x: number, y: number }} viewportSize
 * @returns {{ top: number, bottom: number, left: number, right: number }} pixels
 */
const padding = ({ x }) => (x < 600 ? { top: 0, bottom: 0, left: 0, right: 0 } : { top: 24, bottom: 64, left: 24, right: 24 });

// dataSource is the array of tile elements: PhotoSwipe reads each slide's src (href), srcset,
// width and height from the data-pswp-* attributes, uses the inner <img> as the zoom-animation
// thumbnail, and exposes the element as `slide.data.element` (used below for captions and ids).
// No `gallery`/`children` option is given, so PhotoSwipe doesn't bind clicks itself — the click
// handler further down opens it. The core module is imported lazily on first open.
// preload: [1, 2] = keep 1 previous and 2 next slides loaded; bgOpacity 1 = solid backdrop.
const lightbox = new PhotoSwipeLightbox({
  dataSource: photos,
  pswpModule: () => import("./photoswipe.esm.min.js"),
  paddingFn: padding,
  preload: [1, 2],
  bgOpacity: 1,
});

// Add a caption bar (camera settings on the left, date on the right) to PhotoSwipe's UI. Styled
// by .pswp__caption in site.css; pswp__hide-on-close fades it out with the closing animation.
// PhotoSwipe fires "change" once on open and on every slide change, so the text is always current.
lightbox.on("uiRegister", () => {
  lightbox.pswp.ui.registerElement({
    name: "caption",
    className: "pswp__caption pswp__hide-on-close",
    appendTo: "root",
    onInit: (el, pswp) => {
      const settings = document.createElement("span");
      const date = Object.assign(document.createElement("span"), { className: "pswp__caption-date" });
      el.append(settings, date);
      pswp.on("change", () => {
        const { dataset } = pswp.currSlide.data.element;
        settings.textContent = dataset.caption;
        date.textContent = dataset.date;
      });
    },
  });
});

// Keep the URL in sync with the open photo (/#<id>) so it can be copied and shared.
// replaceState doesn't fire "hashchange" or add history entries, so Back leaves the page rather
// than stepping through every slide.
lightbox.on("change", () => {
  history.replaceState(null, "", `#${lightbox.pswp.currSlide.data.element.id}`);
});

lightbox.on("close", () => {
  // Remove the #id from the URL.
  history.replaceState(null, "", location.pathname + location.search);
  // Bring the thumbnail into view so the closing animation zooms back to it.
  lightbox.pswp.currSlide.data.element.scrollIntoView({ block: "nearest" });
});

lightbox.init();

// One delegated handler for all tiles. Left-clicks open the lightbox at the tile's position in
// `photos`; clicks with a modifier key (or another button) fall through to the normal link
// behaviour, e.g. Cmd/Ctrl-click opens the full-size image in a new tab.
gallery.addEventListener("click", (event) => {
  const photo = event.target.closest(".photo");
  if (!photo || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  lightbox.loadAndOpen(photos.indexOf(photo));
});

// Start downloading the full-size image on hover, at the size PhotoSwipe will request.
// Mouse only (touch has no hover, and this avoids spending mobile data), once per tile.
// PhotoSwipe shows the image scaled to fit inside the padded viewport, never upscaled (fit <= 1),
// and sets the <img> `sizes` to that displayed width. Giving a detached Image the same
// sizes + srcset makes the browser choose — and cache — the same srcset candidate.
const prefetched = new WeakSet();
gallery.addEventListener("pointerover", (event) => {
  const photo = event.target.closest(".photo");
  if (event.pointerType !== "mouse" || !photo || prefetched.has(photo)) return;
  prefetched.add(photo);

  const viewport = { x: document.documentElement.clientWidth, y: innerHeight };
  const pad = padding(viewport);
  const width = Number(photo.dataset.pswpWidth);
  const height = Number(photo.dataset.pswpHeight);
  const fit = Math.min(1, (viewport.x - pad.left - pad.right) / width, (viewport.y - pad.top - pad.bottom) / height);

  const img = new Image();
  // sizes must be set before srcset: assigning srcset is what starts the download.
  img.sizes = `${Math.ceil(width * fit)}px`;
  img.srcset = photo.dataset.pswpSrcset;
});

/**
 * Deep links: open the lightbox on the photo named by the URL hash (e.g. /#1DSC01801, the
 * original's file name without extension). Runs on page load and whenever the user changes the
 * hash. Does nothing if the hash doesn't match a photo or the lightbox is already open
 * (lightbox.pswp is only set while it's open).
 */
function openFromHash() {
  const linked = photos.find((photo) => photo.id === location.hash.slice(1));
  if (!linked || lightbox.pswp) return;
  // Scroll first so the opening zoom animation starts from (and closing returns to) a visible tile.
  linked.scrollIntoView({ block: "center" });
  lightbox.loadAndOpen(photos.indexOf(linked));
}

openFromHash();
addEventListener("hashchange", openFromHash);

// About dialog
const about = document.getElementById("about");
document.querySelector('[aria-controls="about"]').addEventListener("click", () => about.showModal());
// Clicks on the ::backdrop are reported with the <dialog> itself as the target (the content is
// wrapped in .about-inner, which has the padding), so this closes the dialog on outside clicks.
// Esc and the Close button (method="dialog" form) close it natively.
about.addEventListener("click", (event) => {
  if (event.target === about) about.close();
});
