/**
 * Eleventy configuration.
 *
 * Build overview (see README.md for the full picture):
 *   1. Eleventy loads global data from src/_data/. `site.json` holds static site text and
 *      `photos.js` resizes every original in photos/originals/ into _site/img/ and returns
 *      the list of photos (URLs, sizes, EXIF caption, crop info).
 *   2. src/index.njk is rendered once into _site/index.html using that data.
 *   3. The passthrough copies below put the stylesheet, the gallery script and PhotoSwipe's
 *      prebuilt files next to it, so the published site is just _site/.
 *
 * This file is ESM because package.json sets `"type": "module"`.
 */

/** @param {import("@11ty/eleventy").UserConfig} eleventyConfig */
export default function (eleventyConfig) {
  // Copied verbatim (no processing). Keys are source paths, values are destinations inside _site/.
  // PhotoSwipe is vendored straight out of node_modules so there is no bundler step; gallery.js
  // imports these files by their copied names (./photoswipe-lightbox.esm.min.js etc.), so if you
  // rename a destination here, update the import in src/js/gallery.js and the <link>/<script>
  // tags in src/index.njk too.
  eleventyConfig.addPassthroughCopy({
    "src/css": "css",
    "src/js": "js",
    "node_modules/photoswipe/dist/photoswipe.css": "css/photoswipe.css",
    "node_modules/photoswipe/dist/photoswipe-lightbox.esm.min.js": "js/photoswipe-lightbox.esm.min.js",
    "node_modules/photoswipe/dist/photoswipe.esm.min.js": "js/photoswipe.esm.min.js",
  });
  // photos/originals/ lives outside the input dir, so `npm start` wouldn't notice new or edited
  // photos without this. A change re-runs src/_data/photos.js.
  eleventyConfig.addWatchTarget("photos/originals/");
}

// `input` is where templates and _data/ live; `output` is the folder that gets deployed.
// If you change `output`, also change OUTPUT_DIR in src/_data/photos.js and the cache/upload
// paths in .github/workflows/deploy.yml.
export const config = {
  dir: { input: "src", output: "_site" },
};
