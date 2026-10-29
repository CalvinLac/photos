# Photography by Calvin Lac

Static photo gallery built with [Eleventy](https://www.11ty.dev/) and [PhotoSwipe](https://photoswipe.com/), deployed to GitHub Pages.

### Run locally
1. `npm install`
2. `npm start` - builds and serves at http://localhost:8080 (the first build resizes every photo and takes a few minutes)

`npm run build` writes the site to `_site/` without serving it.

### Add or remove photos
Drop exported JPEGs into `photos/originals/` (or delete them from there), then commit and push.

The build creates web-sized AVIF/WebP versions, reads EXIF for captions and alt text, and orders photos newest first by capture date. Originals stay in the repo but are not published.

### Deploy
Pushing to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml). In the repo settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

Link to a single photo with `#<filename>`, e.g. `#1DSC01801`.

