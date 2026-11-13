// 地球：日夜貼圖混合 + 海面反光 + 大氣光暈。只用兩個 draw call。
import * as THREE from 'three';
import { R_EARTH, SCENE_SCALE, gmst, sunDirEci, toScene } from '../core/orbit.js';

const tex = (name) => new URL(`../../assets/textures/${name}`, import.meta.url).href;

export const EARTH_RADIUS = R_EARTH * SCENE_SCALE; // 6.371 場景單位

/**
 * @param {{ quality: object, onProgress?: (loaded:number,total:number)=>void }} opts
 * @returns {{ group: THREE.Group, globe: THREE.Mesh, update: (t:number)=>void, sunDir: THREE.Vector3 }}
 */
export function createEarth({ quality, onProgress }) {
  const group = new THREE.Group();
  group.name = 'earth';
  const [ws, hs] = quality.earthSeg;
  const sunDir = new THREE.Vector3(1, 0, 0);

  const placeholder = new THREE.DataTexture(new Uint8Array([12, 30, 70, 255]), 1, 1);
  placeholder.needsUpdate = true;
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;

  const uniforms = {
    dayMap: { value: placeholder },
    nightMap: { value: black },
    waterMap: { value: black },
    sunDir: { value: sunDir },
  };

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, ws, hs),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){
          vUv = uv;
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D dayMap, nightMap, waterMap; uniform vec3 sunDir;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){
          vec3 n = normalize(vN);
          vec3 v = normalize(cameraPosition - vW);
          float d = dot(n, sunDir);
          float dayMix = smoothstep(-0.12, 0.22, d);
          vec3 day = texture2D(dayMap, vUv).rgb;
          vec3 night = texture2D(nightMap, vUv).rgb;
          night = pow(night, vec3(1.4)) * vec3(1.25, 0.95, 0.6) * 1.8;
          vec3 col = mix(night + day * 0.025, day * (0.18 + 0.95 * max(d, 0.0)), dayMix);
          float water = texture2D(waterMap, vUv).r;
          vec3 h = normalize(sunDir + v);
          col += water * pow(max(dot(n, h), 0.0), 90.0) * 0.35 * dayMix * vec3(1.0, 0.95, 0.85);
          float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          col += vec3(0.30, 0.58, 1.0) * rim * (0.15 + 0.6 * dayMix);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  globe.name = 'globe';
  group.add(globe);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.06, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vW;
        void main(){
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir; varying vec3 vN; varying vec3 vW;
        void main(){
          vec3 v = normalize(cameraPosition - vW);
          float k = pow(clamp(0.72 + dot(normalize(vN), v), 0.0, 1.0), 5.0);
          float lit = smoothstep(-0.35, 0.4, dot(normalize(vN), sunDir));
          gl_FragColor = vec4(vec3(0.32, 0.62, 1.0) * k * 1.8 * (0.25 + 0.95 * lit), 1.0);
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  atmo.name = 'atmosphere';
  group.add(atmo);

  // 貼圖延遲載入：先畫占位色，載好再換
  const files = [
    ['dayMap', `earth-day-${quality.texture}.webp`],
    ['nightMap', 'earth-night-2k.webp'],
    ['waterMap', 'earth-water-1k.webp'],
  ];
  const loader = new THREE.TextureLoader();
  let loaded = 0;
  files.forEach(([key, file]) => {
    loader.load(
      tex(file),
      (t) => {
        t.anisotropy = 2;
        uniforms[key].value = t;
        loaded++;
        onProgress && onProgress(loaded, files.length);
      },
      undefined,
      () => {
        loaded++;
        onProgress && onProgress(loaded, files.length);
      },
    );
  });

  function update(t) {
    globe.rotation.y = gmst(t); // 地球在慣性座標中自轉
    const s = sunDirEci(t);
    toScene(s, sunDir, 1).normalize();
  }

  return { group, globe, update, sunDir };
}
