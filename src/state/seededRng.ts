export type SeededRng = {
  next: () => number; // 0..1
  int: (minInclusive: number, maxExclusive: number) => number;
};

function toUint32(value: number) {
  return value >>> 0;
}

// Mulberry32: small, fast, stable.
function mulberry32(seed: number) {
  let t = toUint32(seed);
  return () => {
    t = toUint32(t + 0x6d2b79f5);
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRng(seed: number): SeededRng {
  const next = mulberry32(seed);
  return {
    next,
    int(minInclusive: number, maxExclusive: number) {
      const min = Math.ceil(minInclusive);
      const max = Math.floor(maxExclusive);
      if (!(max > min)) return min;
      return min + Math.floor(next() * (max - min));
    }
  };
}

export function createRandomSeed(): number {
  try {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] >>> 0;
  } catch {
    return ((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0) || 1;
  }
}

