import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always run Vite from the newliveweb package root so vite.config.ts and index.html are found.
const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

const viteBin =
  process.platform === 'win32'
    ? path.resolve(projectRoot, 'node_modules', '.bin', 'vite.cmd')
    : path.resolve(projectRoot, 'node_modules', '.bin', 'vite');

// Some runners (certain VS Code tasks / shells) can mangle `npm run dev -- --host ... --port ...`
// into positional args like: `vite 127.0.0.1 5174`.
// If we don't see any option-style args, ignore them and use our known-good defaults.
const rawArgs = process.argv.slice(2);
const forwardedArgs = rawArgs.some((a) => a.startsWith('-')) ? rawArgs : [];

const args = ['--host', '127.0.0.1', '--port', '5174', '--strictPort', ...forwardedArgs];

const child = spawn(viteBin, args, {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: process.env,
  shell: true,
  detached: false
});

child.on('exit', (code, signal) => {
  if (typeof code === 'number') process.exit(code);
  // If terminated by signal, exit non-zero.
  process.exit(signal ? 1 : 0);
});
