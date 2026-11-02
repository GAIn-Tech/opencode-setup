/**
 * Deterministic RNG utility for replayable orchestration behavior.
 * - If seed is set, emits reproducible pseudo-random values.
 * - If seed is absent, falls back to Math.random.
 */

function normalizeSeed(rawSeed) {
  if (rawSeed === undefined || rawSeed === null) return '';
  return String(rawSeed).trim();
}

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function createRandomSource(namespace = 'default', explicitSeed = undefined) {
  const envSeed = process.env.OPENCODE_REPLAY_SEED;
  const seed = normalizeSeed(explicitSeed ?? envSeed);

  if (!seed) {
    return {
      seeded: false,
      seed: '',
      next: () => Math.random(),
    };
  }

  const hashed = fnv1a32(`${namespace}:${seed}`);
  const prng = mulberry32(hashed);

  return {
    seeded: true,
    seed,
    next: () => prng(),
  };
}

module.exports = {
  createRandomSource,
};
