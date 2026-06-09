import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

// jsdom reads its default stylesheet at runtime via fs.readFileSync() relative
// to __dirname. esbuild rewrites __dirname to the bundle's output directory, so
// the lookup escapes the action's working directory and fails with ENOENT once
// bundled. Inline the stylesheet at build time so there is no runtime file read.
// See https://github.com/jsdom/jsdom/issues/3951 and
// https://github.com/evanw/esbuild/issues/1311.
const inlineJsdomStylesheet = {
  name: 'inline-jsdom-stylesheet',
  setup(build) {
    const filter =
      /jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]css[\\/]helpers[\\/]computed-style\.js$/;
    build.onLoad({ filter }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      const cssPath = path.resolve(
        path.dirname(args.path),
        '../../../browser/default-stylesheet.css'
      );
      const css = await fs.promises.readFile(cssPath, 'utf8');
      const contents = source.replace(
        /const defaultStyleSheet = fs\.readFileSync\([\s\S]*?\);/,
        `const defaultStyleSheet = ${JSON.stringify(css)};`
      );
      return { contents, loader: 'js' };
    });
  },
};

await esbuild.build({
  entryPoints: ['lib/main.js'],
  bundle: true,
  external: ['./xhr-sync-worker.js'],
  minify: true,
  outdir: 'dist',
  packages: 'bundle',
  platform: 'node',
  sourcemap: true,
  target: 'node24.0.0',
  plugins: [inlineJsdomStylesheet],
});
