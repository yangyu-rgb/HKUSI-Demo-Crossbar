import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
} from "three";
import { CONGESTION_CONFIG } from "./congestionConfig";
import { projectGeo } from "./geoProjection";
import { createLabelSprite, disposeLabelSprite } from "./SceneLabels";
import type { NormalizedRouteStatus, PortVisual, QualityLevel } from "./types";

export function createBorderPort(status: NormalizedRouteStatus, quality: QualityLevel): PortVisual {
  let currentStatus = status;
  const group = new Group();
  group.name = `port-${status.id}`;
  group.position.copy(projectGeo(status.position, 0.18));

  // Keep the checkpoint compact: it should read as infrastructure at overview
  // distance without competing with the live route that runs through it.
  const structuralMaterial = new MeshStandardMaterial({ color: 0x738695, roughness: 0.68, metalness: 0.14 });
  const roofMaterial = new MeshStandardMaterial({ color: 0x9aabba, roughness: 0.54, metalness: 0.18 });
  const darkMaterial = new MeshStandardMaterial({ color: 0x203242, roughness: 0.72, metalness: 0.08 });
  const glassMaterial = new MeshStandardMaterial({
    color: 0x65a3b8,
    emissive: 0x163b49,
    emissiveIntensity: 0.25,
    roughness: 0.3,
    metalness: 0.12,
    transparent: true,
    opacity: 0.62,
  });
  const sharedMaterials = [structuralMaterial, roofMaterial, darkMaterial, glassMaterial];

  const detailGroup = new Group();
  detailGroup.name = `port-${status.id}-checkpoint`;
  group.add(detailGroup);

  const castDetailShadow = quality === "high";
  const receiveDetailShadow = quality !== "low";
  const geometries: BoxGeometry[] = [];
  const createBoxGeometry = (width: number, height: number, depth: number) => {
    const geometry = new BoxGeometry(width, height, depth);
    geometries.push(geometry);
    return geometry;
  };
  const addBox = (
    geometry: BoxGeometry,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    castShadow = castDetailShadow,
  ) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveDetailShadow;
    detailGroup.add(mesh);
    return mesh;
  };

  const platformGeometry = new CylinderGeometry(0.34, 0.4, 0.12, 28);
  const platformMaterial = new MeshStandardMaterial({ color: 0x172535, metalness: 0.42, roughness: 0.52 });
  const platform = new Mesh(platformGeometry, platformMaterial);
  platform.position.y = 0.06;
  platform.receiveShadow = true;
  group.add(platform);

  const checkpointGeometry = createBoxGeometry(0.76, 0.2, 0.24);
  const checkpoint = addBox(checkpointGeometry, structuralMaterial, 0, 0.27, -0.18);
  checkpoint.userData.routeId = status.id;

  const windowGeometry = createBoxGeometry(0.54, 0.075, 0.012);
  addBox(windowGeometry, glassMaterial, 0, 0.29, -0.307, false);

  // Three slim channels communicate the physical crossing direction. The
  // repeated lane pieces share geometry and material within every port.
  const laneGeometry = createBoxGeometry(0.065, 0.055, 0.62);
  for (const offset of [-0.23, 0, 0.23]) {
    addBox(laneGeometry, darkMaterial, offset, 0.155, 0.12, false);
  }

  const canopyGeometry = createBoxGeometry(0.92, 0.045, 0.58);
  addBox(canopyGeometry, roofMaterial, 0, 0.45, 0.06);

  const postGeometry = createBoxGeometry(0.026, 0.28, 0.026);
  const postZ = quality === "low" ? [0.27] : [-0.16, 0.27];
  for (const x of [-0.41, 0.41]) {
    for (const z of postZ) addBox(postGeometry, structuralMaterial, x, 0.3, z);
  }

  if (quality !== "low") {
    const gateGeometry = createBoxGeometry(0.16, 0.085, 0.035);
    for (const offset of [-0.23, 0, 0.23]) {
      addBox(gateGeometry, structuralMaterial, offset, 0.215, 0.3, false);
    }

    const sideBuildingGeometry = createBoxGeometry(0.25, 0.3, 0.34);
    addBox(sideBuildingGeometry, darkMaterial, -0.55, 0.27, -0.1);
    const sideWindowGeometry = createBoxGeometry(0.012, 0.105, 0.2);
    addBox(sideWindowGeometry, glassMaterial, -0.681, 0.3, -0.1, false);
  }

  if (quality === "high") {
    const fasciaGeometry = createBoxGeometry(0.96, 0.055, 0.035);
    addBox(fasciaGeometry, darkMaterial, 0, 0.445, 0.34, false);
    const separatorGeometry = createBoxGeometry(0.012, 0.09, 0.26);
    for (const offset of [-0.115, 0.115]) {
      addBox(separatorGeometry, structuralMaterial, offset, 0.205, 0.12, false);
    }
  }

  const ringGeometry = new RingGeometry(0.43, 0.52, 40);
  const statusConfig = CONGESTION_CONFIG[status.congestionLevel];
  const ringMaterial = new MeshBasicMaterial({ color: statusConfig.color, transparent: true, opacity: 0.72, side: 2, depthWrite: false });
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.14;
  ring.renderOrder = 20;
  ring.userData.routeId = status.id;
  group.add(ring);

  const beaconGeometry = new CylinderGeometry(0.045, 0.045, 0.48, 16);
  const beaconMaterial = new MeshBasicMaterial({ color: statusConfig.color });
  const beacon = new Mesh(beaconGeometry, beaconMaterial);
  beacon.position.y = 0.55;
  beacon.userData.routeId = status.id;
  group.add(beacon);

  const label = createLabelSprite(`${status.name}口岸`, status.nameEn.toUpperCase(), statusConfig.color);
  label.position.set(...status.labelOffset);
  label.scale.set(2.2, 0.69, 1);
  group.add(label);

  let activeState: "default" | "active" | "dimmed" = "default";
  const targetColor = new Color(statusConfig.color);
  return {
    id: status.id,
    group,
    pickMeshes: [ring, beacon, checkpoint],
    updateStatus(nextStatus) {
      currentStatus = nextStatus;
      const next = CONGESTION_CONFIG[nextStatus.congestionLevel];
      targetColor.set(next.color);
    },
    setEmphasis(state) {
      activeState = state;
      group.traverse((object) => { object.visible = state !== "dimmed" || object === label || object === platform; });
      ring.visible = true;
      beacon.visible = true;
      label.visible = true;
      label.material.opacity = state === "dimmed" ? 0.38 : 1;
      ringMaterial.opacity = state === "active" ? 1 : state === "dimmed" ? 0.18 : 0.72;
    },
    update(elapsedSeconds, motionEnabled) {
      if (!motionEnabled) {
        ring.scale.setScalar(1);
        return;
      }
      const pulseStrength = currentStatus.congestionLevel === "severe" ? 0.1 : activeState === "active" ? 0.055 : 0.025;
      const pulseSpeed = currentStatus.congestionLevel === "severe" ? 1.25 : 1.8;
      const scale = 1 + Math.sin(elapsedSeconds * pulseSpeed) * pulseStrength;
      ring.scale.setScalar(scale);
      ringMaterial.color.lerp(targetColor, 0.08);
      beaconMaterial.color.lerp(targetColor, 0.08);
    },
    dispose() {
      platformGeometry.dispose();
      platformMaterial.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      sharedMaterials.forEach((material) => material.dispose());
      ringGeometry.dispose();
      ringMaterial.dispose();
      beaconGeometry.dispose();
      beaconMaterial.dispose();
      disposeLabelSprite(label);
    },
  };
}
