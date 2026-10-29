import PhotoSwipeLightbox from "./photoswipe-lightbox.esm.min.js";

const gallery = document.getElementById("gallery");
const photos = [...gallery.querySelectorAll(".photo")];

for (const img of gallery.querySelectorAll("img")) {
  if (img.complete) img.classList.add("is-loaded");
  else img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
}

// Masonry: fill the shortest column next so newest photos stay at the top. Matches `columns: 4 300px` in CSS.
const MIN_COLUMN_WIDTH = 300;
const GAP = 8;
let columnCount = 0;

function layout() {
  const count = Math.min(4, Math.max(1, Math.floor((gallery.clientWidth - GAP) / (MIN_COLUMN_WIDTH + GAP))));
  if (count === columnCount) return;
  columnCount = count;

  const columns = Array.from({ length: count }, () => Object.assign(document.createElement("div"), { className: "column" }));
  const heights = new Array(count).fill(0);
  for (const photo of photos) {
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
const padding = ({ x }) => (x < 600 ? { top: 0, bottom: 0, left: 0, right: 0 } : { top: 24, bottom: 64, left: 24, right: 24 });

const lightbox = new PhotoSwipeLightbox({
  dataSource: photos,
  pswpModule: () => import("./photoswipe.esm.min.js"),
  paddingFn: padding,
  preload: [1, 2],
  bgOpacity: 1,
});

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

lightbox.on("change", () => {
  history.replaceState(null, "", `#${lightbox.pswp.currSlide.data.element.id}`);
});

lightbox.on("close", () => {
  history.replaceState(null, "", location.pathname + location.search);
  // Bring the thumbnail into view so the closing animation zooms back to it.
  lightbox.pswp.currSlide.data.element.scrollIntoView({ block: "nearest" });
});

lightbox.init();

gallery.addEventListener("click", (event) => {
  const photo = event.target.closest(".photo");
  if (!photo || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  lightbox.loadAndOpen(photos.indexOf(photo));
});

// Start downloading the full-size image on hover, at the size PhotoSwipe will request.
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
  img.sizes = `${Math.ceil(width * fit)}px`;
  img.srcset = photo.dataset.pswpSrcset;
});

function openFromHash() {
  const linked = photos.find((photo) => photo.id === location.hash.slice(1));
  if (!linked || lightbox.pswp) return;
  linked.scrollIntoView({ block: "center" });
  lightbox.loadAndOpen(photos.indexOf(linked));
}

openFromHash();
addEventListener("hashchange", openFromHash);

// About dialog
const about = document.getElementById("about");
document.querySelector('[aria-controls="about"]').addEventListener("click", () => about.showModal());
about.addEventListener("click", (event) => {
  if (event.target === about) about.close();
});
