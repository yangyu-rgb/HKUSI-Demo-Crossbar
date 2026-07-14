import { BoxGeometry, InstancedMesh } from "three";
import { describe, expect, it, vi } from "vitest";
import { createCityBuildings } from "./CityBuildings";
import { QUALITY_CONFIG } from "./congestionConfig";

describe("city building batches", () => {
  it.each(["low", "medium", "high"] as const)("keeps the %s quality building budget", (quality) => {
    const visual = createCityBuildings(quality);
    const meshes = visual.group.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

    expect(meshes.reduce((total, mesh) => total + mesh.count, 0)).toBe(QUALITY_CONFIG[quality].buildingCount);
    expect(meshes.length).toBeLessThanOrEqual(4);
    visual.dispose();
  });

  it("uses procedural silhouettes instead of only box geometry", () => {
    const visual = createCityBuildings("high");
    const geometries = visual.group.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .map((mesh) => mesh.geometry);

    expect(geometries.some((geometry) => !(geometry instanceof BoxGeometry))).toBe(true);
    expect(new Set(geometries.map((geometry) => geometry.type)).size).toBeGreaterThanOrEqual(3);
    visual.dispose();
  });

  it("disposes shared GPU resources once", () => {
    const visual = createCityBuildings("medium");
    const meshes = visual.group.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
    const onGeometryDispose = vi.fn();
    const onMaterialDispose = vi.fn();
    const material = meshes[0].material;
    if (Array.isArray(material)) throw new Error("building batches must use one shared material per archetype");
    meshes[0].geometry.addEventListener("dispose", onGeometryDispose);
    material.addEventListener("dispose", onMaterialDispose);

    visual.dispose();
    visual.dispose();

    expect(onGeometryDispose).toHaveBeenCalledTimes(1);
    expect(onMaterialDispose).toHaveBeenCalledTimes(1);
  });
});
