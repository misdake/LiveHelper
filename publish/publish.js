const Bundler = require('parcel');
const fs = require('fs');
const path = require('path');
const package = require('../package.json');

const VERSION = package.version;
const PUBLISH_DIR = path.join(__dirname, `live-helper-${VERSION}`);

const processOptions = {
  NODE_ENV: 'production'
};

const bundlerOptions = {
  minify: true,
  cache: true,
  sourceMaps: true,
  autoinstall: true,
  contentHash: false,
  publicUrl: './'
};

async function build() {
  console.log('📦 Starting build process...');
  console.log(`📌 Version: ${VERSION}\n`);

  console.log('🔨 Syncing manifest version...');
  syncManifestVersion();
  console.log('✅ Version synced\n');

  console.log('📦 Bundling with Parcel...');
  const startTime = Date.now();
  await bundle();
  console.log(`✅ Bundled in ${((Date.now() - startTime) / 1000).toFixed(2)}s\n`);

  console.log('📂 Preparing publish directory...');
  preparePublishDir();
  console.log('✅ Directory prepared\n');

  console.log('📋 Copying required files...');
  copyRequiredFiles();
  console.log('✅ Files copied\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Build completed!');
  console.log(`📦 Output: ${PUBLISH_DIR}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

function syncManifestVersion() {
  let manifest = fs.readFileSync('manifest.json', 'utf-8');
  manifest = manifest.replace(/("version"\s*:\s*)"(\d+\.\d+\.\d+)"/, (_, v) => {
    return v + '"' + VERSION + '"';
  });
  fs.writeFileSync('manifest.json', manifest);
}

async function bundle() {
  Object.assign(process.env, processOptions);
  const bundler = new Bundler(['src/*.html', 'src/background.ts'], bundlerOptions);
  await bundler.bundle();
  bundler.stop();
}

function preparePublishDir() {
  if (fs.existsSync(PUBLISH_DIR)) {
    fs.rmSync(PUBLISH_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PUBLISH_DIR, { recursive: true });
}

function copyRequiredFiles() {
  const filesToCopy = [
    { src: 'manifest.json', dest: PUBLISH_DIR },
    { src: 'dist', dest: PUBLISH_DIR },
    { src: 'icon', dest: PUBLISH_DIR },
    { src: '_locales', dest: PUBLISH_DIR }
  ];

  filesToCopy.forEach(item => {
    const srcPath = path.join(__dirname, '..', item.src);
    const destPath = item.dest === PUBLISH_DIR
      ? path.join(PUBLISH_DIR, item.src)
      : item.dest;

    console.log(`   - Copying ${item.src}...`);

    if (fs.statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

build().catch(e => {
  console.error('❌ Build failed:', e);
  process.exit(1);
});
