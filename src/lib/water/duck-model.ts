import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import modelAsset from "@/assets/models/rubber-duck-toy.fbx.asset.json";
import colorAsset from "@/assets/models/dirty_base_color.jpg.asset.json";
import roughnessAsset from "@/assets/models/dirty_roughness.jpg.asset.json";
import normalAsset from "@/assets/models/toy_normal.jpg.asset.json";
import type { Thing } from "./objects";

/** Browser-only, original mesh and UV textures; no recoloring or smoothing. */
export class DuckModel {
  private renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 20);
  private pivot = new THREE.Group();
  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private textures: THREE.Texture[] = [];
  private material: THREE.MeshStandardMaterial | null = null;
  ready = false;
  private disposed = false;

  constructor() {
    this.renderer.setSize(384, 384);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.camera.position.set(0, 0, 5);
    this.scene.add(this.pivot, this.sun, new THREE.HemisphereLight(0xffffff, 0x8da9b3, 2));
    this.sun.position.set(-3, 4, 6);
  }

  async load() {
    // Ignore the FBX's workstation texture paths: load the supplied originals instead.
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(() => colorAsset.url);
    const loader = new FBXLoader(manager);
    const buffer = await fetch(modelAsset.url).then((response) => {
      if (!response.ok) throw new Error("Duck model unavailable");
      return response.arrayBuffer();
    });
    const model = loader.parse(buffer, "");
    const textures = new THREE.TextureLoader();
    const [map, roughnessMap, normalMap] = await Promise.all([
      textures.loadAsync(colorAsset.url), textures.loadAsync(roughnessAsset.url), textures.loadAsync(normalAsset.url),
    ]);
    this.textures = [map, roughnessMap, normalMap];
    map.colorSpace = THREE.SRGBColorSpace;
    const originalMaterial = new THREE.MeshStandardMaterial({ map, roughnessMap, normalMap, metalness: 0 });
    this.material = originalMaterial;
    model.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        const old = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of old) {
          const texture = (material as THREE.MeshPhongMaterial).map;
          texture?.dispose();
          material.dispose();
        }
        node.material = originalMaterial;
      }
    });
    // FBXLoader normalizes the source's up axis to Y. View its crown, never its side.
    model.rotation.x += Math.PI / 2;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 2 / Math.max(size.x, size.y);
    model.scale.multiplyScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    this.pivot.add(model);
    if (this.disposed) { this.dispose(); return; }
    this.ready = true;
  }

  draw(ctx: CanvasRenderingContext2D, t: Thing, lean: { x: number; y: number }, light: { x: number; y: number }) {
    if (!this.ready) return;
    this.pivot.rotation.set(-lean.y * 0.7, lean.x * 0.7, 0);
    // Transform the world sunlight to the toy's local heading.
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    const x = light.x * c + light.y * s, y = light.x * s - light.y * c;
    this.sun.position.set(x * 4 - 1, y * 4 + 1, 6);
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, -t.r * 1.5, -t.r * 1.5, t.r * 3, t.r * 3);
  }

  dispose() {
    this.disposed = true;
    this.ready = false;
    this.scene.traverse((node) => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
    this.textures.forEach((texture) => texture.dispose());
    this.material?.dispose();
    this.renderer.dispose();
  }
}