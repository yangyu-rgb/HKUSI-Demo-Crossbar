export type SceneBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type ScenePoint = { x: number; y: number; z: number };

export type CameraFrame = {
  target: ScenePoint;
  position: ScenePoint;
  distance: number;
};

const DEFAULT_VIEW_DIRECTION: ScenePoint = { x: 0.035, y: 0.69, z: 0.723 };

function normalize(point: ScenePoint): ScenePoint {
  const length = Math.hypot(point.x, point.y, point.z) || 1;
  return { x: point.x / length, y: point.y / length, z: point.z / length };
}

function dot(left: ScenePoint, right: ScenePoint): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function createSceneBounds(
  points: ScenePoint[],
  horizontalPadding = 0.55,
  verticalRange: [number, number] = [-0.18, 2.2],
): SceneBounds {
  if (points.length === 0) {
    return { minX: -8, maxX: 8, minY: verticalRange[0], maxY: verticalRange[1], minZ: -7, maxZ: 7 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });
  return {
    minX: minX - horizontalPadding,
    maxX: maxX + horizontalPadding,
    minY: verticalRange[0],
    maxY: verticalRange[1],
    minZ: minZ - horizontalPadding,
    maxZ: maxZ + horizontalPadding,
  };
}

export function calculateOverviewFrame(
  bounds: SceneBounds,
  aspect: number,
  verticalFovDegrees: number,
  padding = 1.1,
): CameraFrame {
  const target = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
  const viewDirection = normalize(DEFAULT_VIEW_DIRECTION);
  const right = normalize({ x: viewDirection.z, y: 0, z: -viewDirection.x });
  const cameraUp = normalize({
    x: viewDirection.y * right.z,
    y: viewDirection.z * right.x - viewDirection.x * right.z,
    z: -viewDirection.y * right.x,
  });
  const verticalFov = Math.max(1, verticalFovDegrees) * Math.PI / 180;
  const tanVertical = Math.tan(verticalFov / 2);
  const tanHorizontal = tanVertical * Math.max(0.1, aspect);
  let distance = 0;

  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [bounds.minY, bounds.maxY]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const offset = { x: x - target.x, y: y - target.y, z: z - target.z };
        const towardCamera = dot(offset, viewDirection);
        distance = Math.max(
          distance,
          towardCamera + Math.abs(dot(offset, right)) / tanHorizontal,
          towardCamera + Math.abs(dot(offset, cameraUp)) / tanVertical,
        );
      }
    }
  }

  distance = Math.max(1, distance * Math.max(1, padding));
  return {
    target,
    position: {
      x: target.x + viewDirection.x * distance,
      y: target.y + viewDirection.y * distance,
      z: target.z + viewDirection.z * distance,
    },
    distance,
  };
}
