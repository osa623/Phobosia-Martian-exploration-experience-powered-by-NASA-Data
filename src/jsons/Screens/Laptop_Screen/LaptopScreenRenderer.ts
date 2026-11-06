import * as THREE from "three";
import { reprojectPlanarUVs } from "@/core/Collision";
import laptopAssets from "@/systems/personal-laptop/assets.generated.json";

const WALLPAPER_URL = laptopAssets.wallpapers[0]?.url ?? "";

interface LaptopScreenBinding {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
}

/** Dedicated static renderer for the physical personal laptop panel. */
export class LaptopScreenRenderer {
  private binding: LaptopScreenBinding | null = null;

  public attachToHabitat(model: THREE.Group) {
    this.dispose();
    if (typeof document === "undefined") return;
    model.updateWorldMatrix(true, true);
    let target: THREE.Mesh | null = null;
    model.traverse(object => {
      if (target || !(object.name === "Habitat_Workstation_Display" || object.name.startsWith("Habitat_Workstation_Display."))) return;
      if ((object as THREE.Mesh).isMesh) {
        target = object as THREE.Mesh;
        return;
      }
      object.traverse(child => {
        if (!target && (child as THREE.Mesh).isMesh) target = child as THREE.Mesh;
      });
    });
    if (!target) {
      console.warn("[Personal Laptop] Habitat_Workstation_Display was not found; physical desktop rendering is unavailable.");
      return;
    }

    const mesh = target as THREE.Mesh;
    const projected = reprojectPlanarUVs(mesh.geometry, { flipV: true });
    const aspect = Math.max(1.3, Math.min(2.2, projected.width / Math.max(0.001, projected.height)));
    const width = 1024;
    const height = Math.round(width / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
    this.binding = { mesh, originalMaterial: mesh.material, material, texture, canvas };
    mesh.material = material;
    mesh.visible = true;

    const wallpaper = new Image();
    wallpaper.onload = () => {
      if (this.binding?.texture !== texture) return;
      this.paint(context, canvas, wallpaper);
      texture.needsUpdate = true;
    };
    wallpaper.onerror = () => {
      if (this.binding?.texture !== texture) return;
      this.paint(context, canvas, null);
      texture.needsUpdate = true;
    };
    wallpaper.src = WALLPAPER_URL;
    this.paint(context, canvas, null);
    texture.needsUpdate = true;
  }

  public dispose() {
    if (!this.binding) return;
    const { mesh, originalMaterial, material, texture } = this.binding;
    if (mesh.material === material) mesh.material = originalMaterial;
    material.dispose();
    texture.dispose();
    this.binding = null;
  }

  private paint(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, wallpaper: HTMLImageElement | null) {
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    if (wallpaper?.naturalWidth) {
      const scale = Math.max(w / wallpaper.naturalWidth, h / wallpaper.naturalHeight);
      const sw = w / scale, sh = h / scale;
      ctx.drawImage(wallpaper, (wallpaper.naturalWidth - sw) / 2, (wallpaper.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
    } else {
      const fallback = ctx.createLinearGradient(0, 0, w, h);
      fallback.addColorStop(0, "#a94c2c"); fallback.addColorStop(0.48, "#ef9a62"); fallback.addColorStop(1, "#263f4a");
      ctx.fillStyle = fallback; ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = "rgba(7, 14, 22, 0.24)";
    ctx.fillRect(0, 0, w, 29);
    ctx.fillStyle = "rgba(248, 250, 252, 0.94)";
    ctx.font = "600 13px Arial, sans-serif";
    ctx.fillText("◉  PHOBOSIA", 18, 19);
    ctx.font = "12px Arial, sans-serif";
    ctx.fillText("File   Edit   View   Window", 135, 19);
    ctx.textAlign = "right";
    ctx.fillText("◉  Local  ·  86%  ·  10:42", w - 17, 19);
    ctx.textAlign = "left";

    const icons = [
      ["▧", "My Gallery", "#ed8e67"],
      ["▣", "My Computer", "#74b5d2"],
      ["▤", "Documents", "#f0d18b"],
      ["♫", "Music", "#ca8be7"],
      ["▧", "Images", "#7cc6b2"],
      ["⌫", "Recycle Bin", "#d4e0e6"]
    ] as const;
    icons.forEach(([glyph, label, color], index) => {
      const col = index % 3, row = Math.floor(index / 3);
      const x = 34 + col * 110, y = 64 + row * 104;
      this.roundRect(ctx, x, y, 54, 54, 14, "rgba(9, 18, 28, 0.42)");
      ctx.fillStyle = color; ctx.font = "bold 27px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText(glyph, x + 27, y + 36);
      ctx.fillStyle = "rgba(255,255,255,0.96)"; ctx.font = "12px Arial, sans-serif"; ctx.fillText(label, x + 27, y + 73);
      ctx.textAlign = "left";
    });

    const dockWidth = Math.min(w - 120, 520), dockX = (w - dockWidth) / 2, dockY = h - 67;
    this.roundRect(ctx, dockX, dockY, dockWidth, 49, 17, "rgba(17, 23, 30, 0.52)");
    const dockItems = ["▧", "▣", "♫", "▤", "◉"];
    const gap = dockWidth / dockItems.length;
    dockItems.forEach((glyph, index) => {
      const cx = dockX + gap * index + gap / 2;
      ctx.beginPath(); ctx.arc(cx, dockY + 23, 15, 0, Math.PI * 2); ctx.fillStyle = ["#ed8e67", "#74b5d2", "#ca8be7", "#f0d18b", "#78aee0"][index]; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 17px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText(glyph, cx, dockY + 29);
      ctx.beginPath(); ctx.arc(cx, dockY + 44, 1.8, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fill();
    });
    ctx.textAlign = "left";
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, fill: string) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y); ctx.arcTo(x + w, y, x + w, y + h, radius); ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius); ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
}
