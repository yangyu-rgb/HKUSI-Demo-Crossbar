import { MathUtils } from "three";

export const ROUTE_RADII = {
  shadow: 0.082,
  core: 0.0525,
  glow: 0.118,
  pick: 0.25,
} as const;

export const PORT_ROUTE_PROGRESS = 0.4;
const QUEUE_ZONE_LENGTH = 0.14;
const MAX_EXTRA_QUEUE_PHASE = 0.3;
const PARTICLE_BATCH_SIZE = 4;

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function createParticleOffsets(count: number, routeIndex: number): Float32Array {
  const offsets = new Float32Array(count);
  const batchCount = Math.max(1, Math.ceil(count / PARTICLE_BATCH_SIZE));
  for (let index = 0; index < count; index += 1) {
    const batch = Math.floor(index / PARTICLE_BATCH_SIZE);
    const positionInBatch = index % PARTICLE_BATCH_SIZE;
    offsets[index] = wrap01(
      batch / batchCount
      + positionInBatch * 0.009
      + (index % 2 === 0 ? 0 : 0.018)
      + routeIndex * 0.071,
    );
  }
  return offsets;
}

/**
 * Converts a uniform time phase into route progress. Congestion gives the
 * short approach zone before the checkpoint more phase space, so particles
 * visibly slow and accumulate on both sides without changing route geometry.
 */
export function mapParticleProgress(
  phase: number,
  direction: 1 | -1,
  queueStrength: number,
): number {
  const normalizedPhase = wrap01(phase);
  const orientedPort = direction === 1 ? PORT_ROUTE_PROGRESS : 1 - PORT_ROUTE_PROGRESS;
  const queueStart = orientedPort - QUEUE_ZONE_LENGTH;
  const queuePhase = QUEUE_ZONE_LENGTH + MathUtils.clamp(queueStrength, 0, 1) * MAX_EXTRA_QUEUE_PHASE;
  const outsideLength = 1 - QUEUE_ZONE_LENGTH;
  const outsidePhase = 1 - queuePhase;
  const beforePhase = outsidePhase * (queueStart / outsideLength);
  const afterPhase = outsidePhase - beforePhase;

  let orientedProgress: number;
  if (normalizedPhase < beforePhase) {
    orientedProgress = beforePhase === 0 ? 0 : normalizedPhase / beforePhase * queueStart;
  } else if (normalizedPhase < beforePhase + queuePhase) {
    orientedProgress = queueStart + (normalizedPhase - beforePhase) / queuePhase * QUEUE_ZONE_LENGTH;
  } else {
    orientedProgress = orientedPort
      + (afterPhase === 0 ? 0 : (normalizedPhase - beforePhase - queuePhase) / afterPhase * (1 - orientedPort));
  }

  return MathUtils.clamp(direction === 1 ? orientedProgress : 1 - orientedProgress, 0, 1);
}
