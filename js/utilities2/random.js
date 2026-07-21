// Seeded pseudo-random number generator
class SeededRandom {
  constructor(seed) {
    this.seed = this.hashSeed(seed);
  }

  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  // Simple hash function to scramble sequential inputs
  hashSeed(seed) {
    let h = seed;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
  }

  step() {
    this.next();
    return this;
  }

  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice(array) {
    return array[Math.floor(this.next() * array.length)];
  }
}

// Auto-generated exports
if (typeof window !== 'undefined') window.SeededRandom = SeededRandom;
export { SeededRandom };
