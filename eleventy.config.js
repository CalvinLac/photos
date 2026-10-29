export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({
    "src/css": "css",
    "src/js": "js",
    "node_modules/photoswipe/dist/photoswipe.css": "css/photoswipe.css",
    "node_modules/photoswipe/dist/photoswipe-lightbox.esm.min.js": "js/photoswipe-lightbox.esm.min.js",
    "node_modules/photoswipe/dist/photoswipe.esm.min.js": "js/photoswipe.esm.min.js",
  });
  eleventyConfig.addWatchTarget("photos/originals/");
}

export const config = {
  dir: { input: "src", output: "_site" },
};
