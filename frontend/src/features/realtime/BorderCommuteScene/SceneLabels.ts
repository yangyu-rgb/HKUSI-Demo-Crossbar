import { CanvasTexture, LinearFilter, Sprite, SpriteMaterial } from "three";

export function createLabelSprite(title: string, subtitle: string, accent = "#8ed7ff"): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(3, 10, 22, 0.86)";
    context.strokeStyle = "rgba(166, 215, 255, 0.34)";
    context.lineWidth = 3;
    context.beginPath();
    context.roundRect(4, 4, 504, 152, 22);
    context.fill();
    context.stroke();
    context.fillStyle = accent;
    context.fillRect(22, 27, 5, 65);
    context.fillStyle = "#f8fbff";
    context.font = "600 38px Inter, sans-serif";
    context.fillText(title, 45, 68);
    context.fillStyle = "#8fa7bd";
    context.font = "500 20px Inter, sans-serif";
    context.letterSpacing = "2px";
    context.fillText(subtitle, 45, 109);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new Sprite(material);
  sprite.scale.set(3.1, 0.97, 1);
  sprite.renderOrder = 40;
  sprite.userData.dispose = () => {
    texture.dispose();
    material.dispose();
  };
  return sprite;
}

export function disposeLabelSprite(sprite: Sprite): void {
  const dispose = sprite.userData.dispose as (() => void) | undefined;
  dispose?.();
}
