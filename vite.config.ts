import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = process.env.GITHUB_SHA ?? '';
if (!/^[a-f\d]{40}$/i.test(commit)) {
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    commit = 'development';
  }
}
const buildInfo = {
  version: packageInfo.version as string,
  commit,
  builtAt: new Date().toISOString(),
};

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'lingus-build-identity',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== '/build.json') return next();
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(buildInfo));
        });
      },
      generateBundle(_options, bundle) {
        const entry = Object.values(bundle).find((file) => file.type === 'chunk' && file.isEntry);
        this.emitFile({
          type: 'asset',
          fileName: 'build.json',
          source: JSON.stringify({ ...buildInfo, entryFile: entry?.fileName }, null, 2),
        });
      },
    },
  ],
  define: { __LINGUS_BUILD__: JSON.stringify(buildInfo) },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/')) return 'vendor';
          if (id.includes('/src/game/')) return 'simulation';
          if (id.includes('/src/components/map')) return 'world-art';
        },
      },
    },
  },
  server: { host: '0.0.0.0', port: 5173 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
