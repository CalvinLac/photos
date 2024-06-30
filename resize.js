const fs = require('fs-extra');
const sharp = require('sharp');
const path = require('path');

const inputDir = 'images';
const fullsDir = 'images/fulls'; // Directory to copy images before resizing
const thumbsDir = 'images/thumbs'; // Directory to save resized images
const width = 512;

// Ensure the directories exist
fs.ensureDirSync(fullsDir);
fs.ensureDirSync(thumbsDir);

// Read all files in the input directory
fs.readdir(inputDir, (err, files) => {
  if (err) {
    console.error('Error reading input directory', err);
    return;
  }

  // Process each file
  const resizePromises = files.map(file => {
    const inputFile = path.join(inputDir, file);
    const outputFileFulls = path.join(fullsDir, file);
    const outputFileThumbs = path.join(thumbsDir, file);

    // Check if the file is an image (optional)
    if (!/\.(jpg|jpeg|png|gif)$/i.test(file)) {
      console.log(`Skipping non-image file: ${file}`);
      return Promise.resolve(); // Skip non-image files
    }

    // Copy the image to fulls directory
    return fs.copy(inputFile, outputFileFulls)
      .then(() => {
        console.log(`Copied ${file} to ${outputFileFulls}`);

        // Resize the image and return the promise
        return sharp(inputFile)
          .resize(width)
          .toFile(outputFileThumbs)
          .then(info => {
            console.log(`Resized ${file} and saved to ${outputFileThumbs}`);
          })
          .catch(err => {
            console.error(`Error processing ${file}`, err);
          });
      })
      .catch(err => {
        console.error(`Error copying ${file}`, err);
      });
  });

  // Wait for all resize operations to complete
  Promise.all(resizePromises)
    .then(() => {
      console.log('All images resized successfully.');

      // Delete all files in the input directory
      fs.readdir(inputDir, (err, files) => {
        if (err) {
          console.error('Error reading input directory for deletion', err);
          return;
        }

        const deletePromises = files.map(file => {
          const filePath = path.join(inputDir, file);

          // Check if it's a file (not a directory)
          return fs.stat(filePath).then(stats => {
            if (stats.isFile()) {
              return fs.unlink(filePath).then(() => {
                console.log(`Deleted file: ${filePath}`);
              });
            }
          });
        });

        // Wait for all deletions to complete
        Promise.all(deletePromises)
          .then(() => {
            console.log('All original files deleted successfully.');
          })
          .catch(err => {
            console.error('Error deleting original files', err);
          });
      });
    })
    .catch(err => {
      console.error('Error resizing images', err);
    });
});