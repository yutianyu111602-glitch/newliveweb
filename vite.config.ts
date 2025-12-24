import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export default defineConfig({
  plugins: [
    glsl(),
    {
      name: 'newliveweb-local-audio-dev',
      apply: 'serve',
      configureServer(server) {
        const envRoot = String(process.env.LOCAL_AUDIO_ROOT ?? '').trim();
        const fallbackWin = process.platform === 'win32' ? 'D:/test MP3' : '';
        const fallbackMac = process.platform === 'darwin' ? path.join(os.homedir(), 'Music') : '';
        const allowedRootRaw = envRoot || fallbackWin || fallbackMac;
        const allowedRoot = allowedRootRaw ? path.resolve(allowedRootRaw) : '';

        server.middlewares.use('/__local_audio', (req, res, next) => {
          try {
            if (!allowedRoot) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Local audio proxy disabled (set LOCAL_AUDIO_ROOT)');
              return;
            }
            if (!req.url) return next();

            const url = new URL(req.url, 'http://localhost');
            const rawPath = url.searchParams.get('path');
            if (!rawPath) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Missing "path" query parameter');
              return;
            }

            // Accept both slash styles from the client; normalize to an absolute real path.
            const requestedPath = path.resolve(rawPath.replace(/\\/g, '/'));
            if (!requestedPath.startsWith(allowedRoot + path.sep) && requestedPath !== allowedRoot) {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Forbidden');
              return;
            }

            let stat;
            try {
              stat = fs.statSync(requestedPath);
            } catch {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Not found');
              return;
            }
            if (!stat.isFile()) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Not found');
              return;
            }

            const totalSize = stat.size;
            const rangeHeader = req.headers.range;

            res.setHeader('Accept-Ranges', 'bytes');
            // Minimal: we only need MP3 for the test track.
            res.setHeader('Content-Type', 'audio/mpeg');

            if (typeof rangeHeader === 'string' && rangeHeader.startsWith('bytes=')) {
              const [startRaw, endRaw] = rangeHeader.slice('bytes='.length).split('-');
              const start = startRaw ? Number(startRaw) : 0;
              const end = endRaw ? Number(endRaw) : totalSize - 1;
              if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= totalSize) {
                res.statusCode = 416;
                res.setHeader('Content-Range', `bytes */${totalSize}`);
                res.end();
                return;
              }

              res.statusCode = 206;
              res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
              res.setHeader('Content-Length', String(end - start + 1));

              if (req.method === 'HEAD') {
                res.end();
                return;
              }

              fs.createReadStream(requestedPath, { start, end }).pipe(res);
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Length', String(totalSize));

            if (req.method === 'HEAD') {
              res.end();
              return;
            }

            fs.createReadStream(requestedPath).pipe(res);
          } catch (err) {
            server.config.logger.error(`[local-audio] ${String(err)}`);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Internal server error');
          }
        });
      }
    }
  ],
  build: {
    target: 'esnext'
  },
  worker: {
    format: 'es'
  },
  server: {
    port: 5174,
    host: '0.0.0.0', // Listen on all IPv4 addresses
    strictPort: true,
    // Allow loading a local test audio file via Vite's /@fs/ mechanism.
    fs: {
      // Dev-only: relax file serving restrictions so /@fs can serve local media.
      strict: false,
      // Must explicitly allow project root + optional local test audio directory.
      // Set `LOCAL_AUDIO_ROOT` to enable cross-platform local media serving.
      allow: (() => {
        const envRoot = String(process.env.LOCAL_AUDIO_ROOT ?? '').trim();
        if (!envRoot) return ['.'];
        const resolved = path.resolve(envRoot);
        const variants = [resolved];
        if (process.platform === 'win32') variants.push(`/${resolved.replace(/\\/g, '/')}`);
        return ['.', ...variants];
      })()
    }
  }
});
