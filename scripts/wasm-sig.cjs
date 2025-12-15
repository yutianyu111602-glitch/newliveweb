const fs = require('fs');

const wasmPath = process.argv[2] || 'public/projectm-runtime/projectm.wasm';
const targetNames = (process.argv[3] ? process.argv[3].split(',') : [
  'pm_create_default',
  'pm_destroy',
  'pm_resize',
  'pm_render_frame',
  'pm_load_preset',
  'pm_update_params',
]);

const buf = fs.readFileSync(wasmPath);
let off = 0;

function u8() {
  return buf[off++];
}

function readBytes(n) {
  const b = buf.subarray(off, off + n);
  off += n;
  return b;
}

function readVarUint() {
  let result = 0;
  let shift = 0;
  while (true) {
    const b = u8();
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return result >>> 0;
    shift += 7;
  }
}

function readString() {
  const len = readVarUint();
  const b = readBytes(len);
  return Buffer.from(b).toString('utf8');
}

function skip(n) {
  off += n;
}

// header
const magic = readBytes(4);
readBytes(4); // version
if (magic[0] !== 0x00 || magic[1] !== 0x61 || magic[2] !== 0x73 || magic[3] !== 0x6d) {
  throw new Error('bad wasm magic');
}

const sections = [];
while (off < buf.length) {
  const id = u8();
  const size = readVarUint();
  const start = off;
  sections.push({ id, size, start });
  skip(size);
}

const secById = (id) => sections.find((s) => s.id === id);

function parseTypeSection(sec) {
  off = sec.start;
  const count = readVarUint();
  const types = [];
  for (let i = 0; i < count; i++) {
    const form = u8();
    if (form !== 0x60) throw new Error('unexpected type form 0x' + form.toString(16));
    const paramCount = readVarUint();
    const params = [];
    for (let p = 0; p < paramCount; p++) params.push(u8());
    const retCount = readVarUint();
    const rets = [];
    for (let r = 0; r < retCount; r++) rets.push(u8());
    types.push({ params, rets });
  }
  return types;
}

function parseImportSection(sec) {
  off = sec.start;
  const count = readVarUint();
  let funcImports = 0;
  for (let i = 0; i < count; i++) {
    readString();
    readString();
    const kind = u8();
    if (kind === 0x00) {
      readVarUint();
      funcImports++;
    } else if (kind === 0x01) {
      u8();
      const flags = readVarUint();
      readVarUint();
      if (flags & 1) readVarUint();
    } else if (kind === 0x02) {
      const flags = readVarUint();
      readVarUint();
      if (flags & 1) readVarUint();
    } else if (kind === 0x03) {
      u8();
      u8();
    } else {
      throw new Error('unknown import kind 0x' + kind.toString(16));
    }
  }
  return { funcImports };
}

function parseFunctionSection(sec) {
  off = sec.start;
  const count = readVarUint();
  const typeIdxs = [];
  for (let i = 0; i < count; i++) typeIdxs.push(readVarUint());
  return typeIdxs;
}

function parseExportSection(sec) {
  off = sec.start;
  const count = readVarUint();
  const exports = [];
  for (let i = 0; i < count; i++) {
    const name = readString();
    const kind = u8();
    const idx = readVarUint();
    exports.push({ name, kind, idx });
  }
  return exports;
}

function vt(b) {
  switch (b) {
    case 0x7f:
      return 'i32';
    case 0x7e:
      return 'i64';
    case 0x7d:
      return 'f32';
    case 0x7c:
      return 'f64';
    case 0x70:
      return 'funcref';
    default:
      return '0x' + b.toString(16);
  }
}

const typeSec = secById(1);
const importSec = secById(2);
const funcSec = secById(3);
const exportSec = secById(7);

const types = typeSec ? parseTypeSection(typeSec) : [];
const { funcImports } = importSec ? parseImportSection(importSec) : { funcImports: 0 };
const funcTypeIdxs = funcSec ? parseFunctionSection(funcSec) : [];
const exportEntries = exportSec ? parseExportSection(exportSec) : [];

function sigForFuncIndex(funcIdx) {
  const definedIdx = funcIdx - funcImports;
  const typeIdx = funcTypeIdxs[definedIdx];
  const t = types[typeIdx];
  return {
    funcIdx,
    typeIdx,
    params: (t?.params || []).map(vt),
    rets: (t?.rets || []).map(vt),
  };
}

for (const name of targetNames) {
  const ex = exportEntries.find((e) => e.name === name && e.kind === 0x00);
  if (!ex) {
    console.log(`${name}: (not exported)`);
    continue;
  }
  const sig = sigForFuncIndex(ex.idx);
  console.log(`${name}: funcidx=${sig.funcIdx} typeidx=${sig.typeIdx} (${sig.params.join(', ')}) -> (${sig.rets.join(', ')})`);
}
