/**
 * Fast, deterministic 32-bit PRNG (Mulberry32) for reproducible spatial benchmarking.
 */
export class DeterministicRandom {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed >>> 0;
  }

  public nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextRange(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  public nextGaussian(mean: number = 0, stdDev: number = 1): number {
    const u1 = Math.max(1e-7, this.nextFloat());
    const u2 = this.nextFloat();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  public nextLogNormal(median: number, sigma: number): number {
    const z = this.nextGaussian(0, 1);
    return median * Math.exp(sigma * z);
  }
}
