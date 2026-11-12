import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const GOLD = new THREE.Color('#f0b862');

/** Real latitude/longitude -> point on a three.js SphereGeometry with an equirectangular texture. */
export function latLonToVector3(lat, lon, radius = 1, target = new THREE.Vector3()) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return target.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/** Approximate sub-solar point (where the sun is directly overhead) for a given date. */
export function subsolarPoint(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const decl = -23.44 * Math.cos((TAU / 365) * (day + 10));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const B = (TAU * (day - 81)) / 364;
  const eotMinutes = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  let lon = -15 * (hours - 12 + eotMinutes / 60);
  lon = ((lon + 540) % 360) - 180;
  return { lat: decl, lon };
}

const ease = {
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
const smooth = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform sampler2D uTopoWater;
  uniform vec3 uSunDir;
  uniform float uCloudOffset;
  uniform float uCloudShadow;
  uniform float uCityLights;
  uniform vec2 uTexel;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vPosW);

    // Cheap bump mapping from the topology map, in a local east/north frame.
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-5, 0.0, 0.0));
    vec3 north = cross(n, east);
    float hL = texture2D(uTopoWater, vUv - vec2(uTexel.x, 0.0)).r;
    float hR = texture2D(uTopoWater, vUv + vec2(uTexel.x, 0.0)).r;
    float hD = texture2D(uTopoWater, vUv - vec2(0.0, uTexel.y)).r;
    float hU = texture2D(uTopoWater, vUv + vec2(0.0, uTexel.y)).r;
    vec3 nb = normalize(n - 1.4 * ((hR - hL) * east + (hU - hD) * north));

    float sunGeo = dot(n, uSunDir);
    float sunBump = dot(nb, uSunDir);
    float dayMix = smoothstep(-0.16, 0.26, sunGeo);

    float water = texture2D(uTopoWater, vUv).g;
    float cloud = texture2D(uClouds, vUv + vec2(uCloudOffset, 0.0)).r;
    float shadow = 1.0 - uCloudShadow * cloud * 0.5;

    // Day side
    vec3 day = texture2D(uDay, vUv).rgb;
    float diffuse = clamp(sunBump * 1.05 + 0.06, 0.0, 1.0);
    vec3 dayCol = day * (0.04 + 1.15 * diffuse) * shadow;
    vec3 h = normalize(uSunDir + viewDir);
    float nh = max(dot(n, h), 0.0);
    float spec = (pow(nh, 70.0) * 1.1 + pow(nh, 9.0) * 0.08) * water * shadow;
    dayCol += vec3(1.0, 0.9, 0.74) * spec * smoothstep(0.0, 0.2, sunGeo);

    // Night side: faint moonlit ground plus warm city lights
    vec3 nightTex = texture2D(uNight, vUv).rgb;
    float warm = max(nightTex.r - nightTex.b * 0.85, 0.0);
    vec3 lights = vec3(1.0, 0.66, 0.3) * pow(clamp(warm * 3.4, 0.0, 1.0), 1.25) * 2.6;
    lights *= 1.0 - uCloudShadow * cloud * 0.65;
    vec3 nightCol = nightTex * vec3(0.5, 0.6, 0.85) * 1.05 + lights * uCityLights;

    vec3 col = mix(nightCol, dayCol, dayMix);
    // City lights still glimmer faintly through dusk
    col += lights * uCityLights * 0.35 * (1.0 - smoothstep(-0.05, 0.25, sunGeo)) * dayMix;

    // Atmospheric rim on the surface
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.6);
    vec3 atmoDay = vec3(0.32, 0.62, 1.0);
    vec3 atmoTwilight = vec3(1.0, 0.46, 0.16);
    vec3 atmo = mix(atmoTwilight, atmoDay, smoothstep(-0.05, 0.55, sunGeo));
    col += atmo * fres * smoothstep(-0.35, 0.45, sunGeo) * 1.05;
    col += vec3(0.08, 0.2, 0.5) * fres * 0.35;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CLOUD_FRAG = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    float c = texture2D(uClouds, vUv).r;
    vec3 n = normalize(vNormalW);
    float sd = dot(n, uSunDir);
    float lit = smoothstep(-0.18, 0.35, sd);
    vec3 col = mix(vec3(0.06, 0.08, 0.13), vec3(1.0), lit);
    float dusk = smoothstep(-0.2, 0.0, sd) * (1.0 - smoothstep(0.0, 0.3, sd));
    col = mix(col, vec3(1.0, 0.58, 0.32), dusk * 0.6);
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float limb = smoothstep(0.0, 0.25, dot(n, viewDir));
    float a = c * mix(0.32, 0.92, lit) * uOpacity * mix(0.55, 1.0, limb);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uOuter;
  varying vec3 vPosW;
  void main() {
    vec3 rayDir = normalize(vPosW - cameraPosition);
    float tca = dot(-cameraPosition, rayDir);
    vec3 closest = cameraPosition + rayDir * tca;
    float h = length(closest);
    float t = clamp((h - 1.0) / (uOuter - 1.0), 0.0, 1.0);
    float glow = pow(1.0 - t, 3.4);
    vec3 nrm = normalize(closest);
    float sd = dot(nrm, uSunDir);
    float lit = smoothstep(-0.3, 0.4, sd);
    float dusk = exp(-pow(sd / 0.28, 2.0));
    float forward = pow(max(dot(rayDir, uSunDir), 0.0), 7.0);
    vec3 night = vec3(0.10, 0.24, 0.62);
    vec3 day = vec3(0.30, 0.62, 1.0);
    vec3 twilight = vec3(1.0, 0.5, 0.2);
    vec3 col = mix(night * 0.55, day, lit);
    col = mix(col, twilight, dusk * 0.55 * smoothstep(-0.6, 0.0, sd));
    col += vec3(1.0, 0.72, 0.42) * forward * 0.95;
    vec3 outCol = col * glow;
    gl_FragColor = vec4(outCol, clamp(max(outCol.r, max(outCol.g, outCol.b)), 0.0, 1.0));
  }
`;

const ARC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ARC_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uProgress;
  uniform float uTime;
  uniform float uDashes;
  uniform float uOpacity;
  uniform float uGlow;
  varying vec2 vUv;
  void main() {
    float t = vUv.x;
    if (t > uProgress) discard;
    float ends = smoothstep(0.0, 0.025, t) * smoothstep(1.0, 0.975, t);
    float head = smoothstep(uProgress - 0.08, uProgress, t) * step(uProgress, 0.999);
    float a;
    if (uGlow > 0.5) {
      a = 0.22 + head * 0.5;
    } else {
      float d = fract(t * uDashes - uTime * 0.8);
      float dash = smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.5, 0.58, d));
      a = 0.38 + 0.62 * dash + head;
    }
    gl_FragColor = vec4(uColor * (1.0 + head * 0.8), a * ends * uOpacity);
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = pow(max(1.0 - d, 0.0), 2.2);
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float fade = pow(1.0 - vUv.y, 1.6);
    gl_FragColor = vec4(uColor, fade * uOpacity);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vTwinkle;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vTwinkle = 0.65 + 0.35 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 40.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  varying float vTwinkle;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * vTwinkle, a * vTwinkle);
  }
`;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function radialTexture(stops, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sunTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const m = size / 2;
  const grd = g.createRadialGradient(m, m, 0, m, m, m);
  grd.addColorStop(0, 'rgba(255,255,250,1)');
  grd.addColorStop(0.06, 'rgba(255,244,214,0.95)');
  grd.addColorStop(0.18, 'rgba(255,200,120,0.35)');
  grd.addColorStop(0.45, 'rgba(255,150,60,0.08)');
  grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  // soft streaks
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    g.save();
    g.translate(m, m);
    g.rotate((i / 6) * Math.PI + 0.3);
    const lg = g.createLinearGradient(-m, 0, m, 0);
    lg.addColorStop(0, 'rgba(255,210,150,0)');
    lg.addColorStop(0.5, `rgba(255,230,190,${i % 2 ? 0.18 : 0.32})`);
    lg.addColorStop(1, 'rgba(255,210,150,0)');
    g.fillStyle = lg;
    g.fillRect(-m, -1.2, size, 2.4);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function slerpUnit(a, b, t, out) {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const omega = Math.acos(dot);
  if (omega < 1e-5) return out.copy(a);
  const s = Math.sin(omega);
  return out
    .copy(a)
    .multiplyScalar(Math.sin((1 - t) * omega) / s)
    .addScaledVector(b, Math.sin(t * omega) / s);
}

function buildPlane() {
  const plane = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: 0xf5f7fb,
    roughness: 0.32,
    metalness: 0.25,
    emissive: 0x2a3550,
    emissiveIntensity: 0.55,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0xf0a94c,
    roughness: 0.4,
    metalness: 0.2,
    emissive: 0x6a3e0c,
    emissiveIntensity: 0.6,
  });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a40, roughness: 0.1, metalness: 0.6 });

  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.92, 6, 14), body);
  fuselage.rotation.x = Math.PI / 2;
  plane.add(fuselage);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, TAU, 0, Math.PI / 2.4), glass);
  cockpit.position.set(0, 0.035, 0.47);
  cockpit.rotation.x = 0.55;
  plane.add(cockpit);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.18);
  wingShape.lineTo(0.68, -0.16);
  wingShape.lineTo(0.68, -0.27);
  wingShape.lineTo(0, -0.12);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.025, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2);
  for (const side of [1, -1]) {
    const w = new THREE.Mesh(wingGeo, body);
    w.scale.x = side;
    w.position.set(0, -0.03, 0.05);
    plane.add(w);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.2, 12), accent);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 0.28, -0.085, 0.05);
    plane.add(engine);
  }

  const stabShape = new THREE.Shape();
  stabShape.moveTo(0, 0.06);
  stabShape.lineTo(0.26, -0.08);
  stabShape.lineTo(0.26, -0.14);
  stabShape.lineTo(0, -0.07);
  stabShape.closePath();
  const stabGeo = new THREE.ExtrudeGeometry(stabShape, { depth: 0.018, bevelEnabled: false });
  stabGeo.rotateX(Math.PI / 2);
  for (const side of [1, -1]) {
    const s = new THREE.Mesh(stabGeo, body);
    s.scale.x = side;
    s.position.set(0, 0.0, -0.44);
    plane.add(s);
  }

  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(-0.2, 0.0);
  finShape.lineTo(-0.3, 0.26);
  finShape.lineTo(-0.2, 0.26);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.018, bevelEnabled: false });
  finGeo.rotateY(-Math.PI / 2);
  const fin = new THREE.Mesh(finGeo, accent);
  fin.position.set(-0.009, 0.05, -0.3);
  plane.add(fin);

  // navigation lights
  const navRed = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3b3b })
  );
  navRed.position.set(-0.68, -0.03, -0.2);
  const navGreen = navRed.clone();
  navGreen.material = new THREE.MeshBasicMaterial({ color: 0x3bff7a });
  navGreen.position.x = 0.68;
  plane.add(navRed, navGreen);
  plane.userData.navLights = [navRed, navGreen];
  return plane;
}

/* ------------------------------------------------------------------ */
/* Globe                                                               */
/* ------------------------------------------------------------------ */

export class Globe {
  constructor({ canvas, labelLayer, destinations, origin, textures, onSelect, onHover, onProgress, onInteract }) {
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    this.destinations = destinations;
    this.origin = origin;
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});
    this.onInteract = onInteract || (() => {});
    this.textureUrls = textures;

    this.settings = {
      autoRotate: true,
      lighting: 'night', // 'day' | 'night' | 'live'
      clouds: true,
      flightPath: true,
    };

    this.time = 0;
    this.selectedId = null;
    this.hoverId = null;
    this.lastInteraction = -10;
    this.interacting = false;
    this.focusAnim = null;
    this.zoomAnim = null;
    this.autoSpeed = 0;
    this.viewport = null;
    this.viewCenter = { x: 0, y: 0, tx: 0, ty: 0 };
    this.fitDistance = 3.2;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._initRenderer();
    this._initScene();
    this.ready = this._loadTextures(onProgress).then(() => {
      this._buildEarth();
      this._buildMarkers();
      this._buildRoutes();
      this._bindEvents();
      this.resize();
      this.clock = new THREE.Clock();
      this.renderer.setAnimationLoop(() => this._tick());
    });
  }

  /* ---------- setup ---------- */

  _initRenderer() {
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.08;
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = this.maxPixelRatio;
    r.setPixelRatio(this.pixelRatio);
    this.renderer = r;
    this.perf = { frames: 0, acc: 0, lastChange: 0 };
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
    this.camera.position.set(-2.2, 2.6, 9.5);

    const c = new OrbitControls(this.camera, this.canvas);
    c.enableDamping = true;
    c.dampingFactor = 0.07;
    c.enablePan = false;
    c.rotateSpeed = 0.5;
    c.zoomSpeed = 0.7;
    c.minDistance = 1.32;
    c.maxDistance = 9;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = Math.PI - 0.12;
    c.autoRotate = false;
    this.controls = c;

    this.sunDir = new THREE.Vector3(-0.3, 0.3, -0.9).normalize();
    this.sunTarget = this.sunDir.clone();

    this.sunLight = new THREE.DirectionalLight(0xfff1dd, 2.6);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.AmbientLight(0x8fa6d6, 0.55));

    this._buildStars();

    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      })
    );
    this.sunSprite.scale.setScalar(9);
    this.scene.add(this.sunSprite);
  }

  _buildStars() {
    const count = window.innerWidth < 700 ? 2600 : 5200;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    const tints = [new THREE.Color('#ffffff'), new THREE.Color('#cfe0ff'), new THREE.Color('#ffe6c4'), new THREE.Color('#a9c4ff')];
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(120 + Math.random() * 120);
      pos.set([v.x, v.y, v.z], i * 3);
      const big = Math.random() < 0.04;
      size[i] = big ? 2.4 + Math.random() * 2.2 : 0.7 + Math.random() * 1.4;
      phase[i] = Math.random();
      const t = tints[(Math.random() * tints.length) | 0];
      const b = 0.55 + Math.random() * 0.45;
      color.set([t.r * b, t.g * b, t.b * b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    this.starUniforms = { uTime: { value: 0 }, uPixelRatio: { value: this.pixelRatio } };
    const m = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: this.starUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(g, m);
    this.scene.add(this.stars);
  }

  _loadTextures(onProgress) {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => onProgress && onProgress(loaded / total);
    const loader = new THREE.TextureLoader(manager);
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const load = (url, srgb) =>
      new Promise((resolve, reject) => {
        loader.load(
          url,
          (t) => {
            t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.anisotropy = aniso;
            t.wrapS = THREE.RepeatWrapping;
            resolve(t);
          },
          undefined,
          reject
        );
      });
    const u = this.textureUrls;
    return Promise.all([load(u.day, true), load(u.night, true), load(u.clouds, false), load(u.topoWater, false)]).then(
      ([day, night, clouds, topoWater]) => {
        this.tex = { day, night, clouds, topoWater };
      }
    );
  }

  _buildEarth() {
    this.earthGroup = new THREE.Group();
    this.scene.add(this.earthGroup);

    this.earthUniforms = {
      uDay: { value: this.tex.day },
      uNight: { value: this.tex.night },
      uClouds: { value: this.tex.clouds },
      uTopoWater: { value: this.tex.topoWater },
      uSunDir: { value: this.sunDir },
      uCloudOffset: { value: 0 },
      uCloudShadow: { value: 1 },
      uCityLights: { value: 1 },
      uTexel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) },
    };
    const segs = window.innerWidth < 700 ? 96 : 128;
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, segs, segs * 0.75),
      new THREE.ShaderMaterial({ vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG, uniforms: this.earthUniforms })
    );
    this.earthGroup.add(this.earth);

    this.cloudUniforms = {
      uClouds: { value: this.tex.clouds },
      uSunDir: { value: this.sunDir },
      uOpacity: { value: 1 },
    };
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.012, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: EARTH_VERT,
        fragmentShader: CLOUD_FRAG,
        uniforms: this.cloudUniforms,
        transparent: true,
        depthWrite: false,
      })
    );
    this.earthGroup.add(this.clouds);

    const outer = 1.17;
    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(outer, 72, 48),
      new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        uniforms: { uSunDir: { value: this.sunDir }, uOuter: { value: outer } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        // Premultiplied additive: keeps the glow correct over the transparent canvas.
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneFactor,
      })
    );
    this.earthGroup.add(this.atmo);
  }

  _buildMarkers() {
    this.markerGroup = new THREE.Group();
    this.earthGroup.add(this.markerGroup);
    this.markers = new Map();
    this.hitTargets = [];

    const dotGeo = new THREE.CircleGeometry(0.0075, 24);
    const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
    const glowGeo = new THREE.PlaneGeometry(1, 1);
    const hitGeo = new THREE.SphereGeometry(0.04, 8, 6);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    const make = (item, isOrigin = false) => {
      const color = isOrigin ? new THREE.Color('#9cc8ff') : GOLD.clone();
      const g = new THREE.Group();
      const pos = latLonToVector3(item.lat, item.lon, 1.0025);
      g.position.copy(pos);
      g.lookAt(pos.clone().multiplyScalar(2));

      const dot = new THREE.Mesh(
        dotGeo,
        new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.4), transparent: true, depthWrite: false })
      );
      const glow = new THREE.Mesh(
        glowGeo,
        new THREE.ShaderMaterial({
          vertexShader: ARC_VERT,
          fragmentShader: GLOW_FRAG,
          uniforms: { uColor: { value: color }, uOpacity: { value: 0.9 } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      glow.scale.setScalar(0.06);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        })
      );
      ring.scale.setScalar(0.02);
      g.add(glow, dot, ring);

      if (!isOrigin) {
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.userData.id = item.id;
        g.add(hit);
        this.hitTargets.push(hit);
      }

      this.markerGroup.add(g);
      const normal = pos.clone().normalize();
      const entry = { item, group: g, dot, glow, ring, normal, world: pos.clone(), isOrigin, phase: Math.random() * TAU, emphasis: 0 };
      this.markers.set(isOrigin ? 'origin' : item.id, entry);
      return entry;
    };

    this.destinations.forEach((d) => make(d));
    make(this.origin, true);

    // Light beam for the selected destination
    const beamGeo = new THREE.CylinderGeometry(0.0035, 0.0012, 0.22, 12, 1, true);
    beamGeo.translate(0, 0.11, 0);
    beamGeo.rotateX(Math.PI / 2); // align with +Z (outward after lookAt)
    this.beamUniforms = { uColor: { value: GOLD.clone().multiplyScalar(1.3) }, uOpacity: { value: 0 } };
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.ShaderMaterial({
        vertexShader: ARC_VERT,
        fragmentShader: BEAM_FRAG,
        uniforms: this.beamUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    this.beam.visible = false;
    this.markerGroup.add(this.beam);
  }

  _buildRoutes() {
    this.routeGroup = new THREE.Group();
    this.earthGroup.add(this.routeGroup);
    this.legs = [];
    this.routeOpacity = 1;
    this.plane = buildPlane();
    this.plane.scale.setScalar(0.052);
    this.plane.visible = false;
    this.scene.add(this.plane);
    this.flight = { t: 0, total: 0, pause: 0 };
  }

  /* ---------- events ---------- */

  _bindEvents() {
    const c = this.controls;
    c.addEventListener('start', () => {
      this.interacting = true;
      this.focusAnim = null;
      this.zoomAnim = null;
      this.onInteract();
    });
    c.addEventListener('end', () => {
      this.interacting = false;
      this.lastInteraction = this.time;
    });

    // Click / tap on 3D markers (labels handle their own clicks)
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down = null;
    const toNdc = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const pick = (e) => {
      toNdc(e);
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObjects(this.hitTargets, false);
      for (const h of hits) {
        const m = this.markers.get(h.object.userData.id);
        if (this._facing(m) > 0.05) return m.item.id;
      }
      return null;
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 6 && performance.now() - down.t < 500) {
        const id = pick(e);
        if (id) this.onSelect(id, 'globe');
      }
      down = null;
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const id = pick(e);
      this.canvas.style.cursor = id ? 'pointer' : 'grab';
      if (id !== this.hoverId) this.onHover(id);
    });

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.canvas);
    window.addEventListener('resize', () => this.resize());
  }

  /* ---------- public API ---------- */

  setLabels(map) {
    // map: id -> HTMLElement
    this.labels = map;
  }

  setViewport(rect) {
    // rect: the screen area (CSS px) the globe should sit in, avoiding panels.
    this.viewport = rect;
    this._applyViewport(false);
  }

  setSetting(key, value) {
    this.settings[key] = value;
    if (key === 'autoRotate' && value) this.lastInteraction = -10;
  }

  setHover(id) {
    this.hoverId = id;
  }

  /** Move the departure marker (key 'origin') to a new airport. */
  setOrigin(item) {
    this.origin = item;
    const m = this.markers?.get('origin');
    if (!m) return;
    const pos = latLonToVector3(item.lat, item.lon, 1.0025);
    m.item = item;
    m.group.position.copy(pos);
    m.group.lookAt(pos.clone().multiplyScalar(2));
    m.world.copy(pos);
    m.normal.copy(pos).normalize();
  }

  setSelected(id) {
    this.selectedId = id;
    const m = id && this.markers?.get(id);
    if (m) {
      this.beam.visible = true;
      this.beam.position.copy(m.group.position);
      this.beam.quaternion.copy(m.group.quaternion);
      this.beamUniforms.uOpacity.value = 0;
    } else if (this.beam) {
      this.beam.visible = false;
    }
  }

  /** Smoothly turn the camera to look straight at a lat/lon. */
  flyTo(lat, lon, { distance, duration } = {}) {
    if (!this.camera) return;
    const target = latLonToVector3(lat, lon, 1).normalize();
    const from = new THREE.Spherical().setFromVector3(this.camera.position);
    const to = new THREE.Spherical().setFromVector3(target);
    to.phi = THREE.MathUtils.clamp(to.phi, 0.32, Math.PI - 0.32);
    let dTheta = to.theta - from.theta;
    dTheta = ((dTheta + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const angle = this.camera.position.clone().normalize().angleTo(target);
    const toRadius = THREE.MathUtils.clamp(distance ?? Math.min(from.radius, this.fitDistance), this.controls.minDistance, this.controls.maxDistance);
    this.focusAnim = {
      from: { theta: from.theta, phi: from.phi, radius: from.radius },
      delta: { theta: dTheta, phi: to.phi - from.phi, radius: toRadius - from.radius },
      t: 0,
      duration: this.reducedMotion ? 0.01 : duration ?? THREE.MathUtils.clamp(1.0 + angle * 0.55, 1.1, 2.4),
    };
    this.lastInteraction = this.time;
  }

  zoomBy(factor) {
    const r = this.camera.position.length();
    const to = THREE.MathUtils.clamp(r * factor, this.controls.minDistance, this.controls.maxDistance);
    this.zoomAnim = { from: r, to, t: 0, duration: 0.45 };
    this.focusAnim = null;
    this.lastInteraction = this.time;
  }

  resetView() {
    const id = this.selectedId;
    if (id) {
      const d = this.markers.get(id).item;
      this.flyTo(d.lat, d.lon, { distance: this.fitDistance });
    } else {
      this.flyTo(30, 15, { distance: this.fitDistance });
    }
  }

  intro() {
    // Start far away and sweep in towards Europe.
    this.camera.position.setFromSphericalCoords(this.fitDistance * 2.6, 1.0, -0.9);
    this.controls.update();
    this.flyTo(28, 22, { distance: this.fitDistance, duration: this.reducedMotion ? 0.01 : 2.6 });
  }

  /** Route: array of {lat, lon}; legs drawn in order. `previewFrom` = index from which legs are "preview" style. */
  setRoute(stops, { previewFrom = Infinity } = {}) {
    for (const leg of this.legs) {
      leg.mesh.geometry.dispose();
      leg.glow.geometry.dispose();
      leg.mesh.material.dispose();
      leg.glow.material.dispose();
      this.routeGroup.remove(leg.mesh, leg.glow);
    }
    this.legs = [];
    if (!stops || stops.length < 2) {
      this.plane.visible = false;
      this.flight.total = 0;
      return;
    }
    let delay = 0;
    let cumulative = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      const a = latLonToVector3(stops[i].lat, stops[i].lon, 1).normalize();
      const b = latLonToVector3(stops[i + 1].lat, stops[i + 1].lon, 1).normalize();
      const omega = a.angleTo(b);
      const alt = THREE.MathUtils.clamp(0.05 + omega * 0.16, 0.06, 0.36);
      const pts = [];
      const N = 72;
      const tmp = new THREE.Vector3();
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        slerpUnit(a, b, t, tmp);
        pts.push(tmp.clone().multiplyScalar(1.004 + alt * Math.sin(Math.PI * t)));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const length = curve.getLength();
      const preview = i >= previewFrom;
      const color = preview ? new THREE.Color('#cfe2ff') : GOLD.clone().multiplyScalar(1.25);
      const mkMat = (glow) =>
        new THREE.ShaderMaterial({
          vertexShader: ARC_VERT,
          fragmentShader: ARC_FRAG,
          uniforms: {
            uColor: { value: color },
            uProgress: { value: 0 },
            uTime: { value: 0 },
            uDashes: { value: Math.max(6, Math.round(length / 0.035)) },
            uOpacity: { value: preview ? 0.75 : 1 },
            uGlow: { value: glow ? 1 : 0 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
      const segs = Math.max(48, Math.round(length * 90));
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.0032, 6, false), mkMat(false));
      const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.011, 8, false), mkMat(true));
      this.routeGroup.add(glow, mesh);
      const drawTime = THREE.MathUtils.clamp(length * 0.9, 0.6, 1.6);
      this.legs.push({ curve, length, mesh, glow, preview, start: this.time + delay, drawTime, cumStart: cumulative });
      delay += drawTime * 0.65;
      cumulative += length;
    }
    this.flight = { t: 0, total: cumulative, pause: delay + 0.2 };
    this.plane.visible = false;
  }

  /* ---------- internals ---------- */

  _facing(m) {
    const camDir = this._tmpV || (this._tmpV = new THREE.Vector3());
    camDir.copy(this.camera.position).sub(m.world).normalize();
    return m.normal.dot(camDir);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this._applyViewport(true);
  }

  _applyViewport(snap) {
    if (!this.size) return;
    const { w, h } = this.size;
    const vp = this.viewport || { x: 0, y: 0, w, h };
    this.viewCenter.tx = vp.x + vp.w / 2;
    this.viewCenter.ty = vp.y + vp.h / 2;
    if (snap || !this._viewInit) {
      this.viewCenter.x = this.viewCenter.tx;
      this.viewCenter.y = this.viewCenter.ty;
      this._viewInit = true;
    }
    // Distance at which the globe's radius fills ~46% of the smaller side of the viewport.
    const radiusPx = Math.max(70, Math.min(vp.w * 0.56, vp.h * 0.44));
    const k = (radiusPx / (h / 2)) * Math.tan((this.camera.fov * DEG) / 2);
    const fit = 1 / Math.sin(Math.atan(k));
    this.fitDistance = THREE.MathUtils.clamp(fit, 1.6, 8);
    this.controls.maxDistance = Math.max(this.fitDistance * 1.8, 4);
    this._updateViewOffset();
  }

  _updateViewOffset() {
    const { w, h } = this.size;
    this.camera.setViewOffset(w, h, w / 2 - this.viewCenter.x, h / 2 - this.viewCenter.y, w, h);
    this.camera.updateProjectionMatrix();
  }

  _updateSun(dt) {
    const s = this.settings.lighting;
    const q = this.camera.quaternion;
    if (s === 'day') this.sunTarget.set(-0.5, 0.38, 0.78).normalize().applyQuaternion(q);
    else if (s === 'night') this.sunTarget.set(-0.42, 0.26, -0.87).normalize().applyQuaternion(q);
    else {
      if (!this._liveSun || this.time - this._liveSunAt > 30) {
        const p = subsolarPoint(new Date());
        this._liveSun = latLonToVector3(p.lat, p.lon, 1).normalize();
        this._liveSunAt = this.time;
      }
      this.sunTarget.copy(this._liveSun);
    }
    const t = 1 - Math.exp(-dt * 3.2);
    if (this.sunDir.dot(this.sunTarget) < -0.97) this.sunDir.add(new THREE.Vector3(0, 0.05, 0)).normalize();
    slerpUnit(this.sunDir.clone(), this.sunTarget, t, this.sunDir);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(10);
    this.sunSprite.position.copy(this.sunDir).multiplyScalar(60);
  }

  _updateCamera(dt) {
    const c = this.controls;
    if (this.focusAnim) {
      const f = this.focusAnim;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = ease.inOutCubic(f.t);
      const s = new THREE.Spherical(
        f.from.radius + f.delta.radius * e,
        f.from.phi + f.delta.phi * e,
        f.from.theta + f.delta.theta * e
      );
      this.camera.position.setFromSpherical(s);
      this.camera.lookAt(c.target);
      if (f.t >= 1) {
        this.focusAnim = null;
        this.lastInteraction = this.time;
      }
    } else if (this.zoomAnim) {
      const z = this.zoomAnim;
      z.t = Math.min(1, z.t + dt / z.duration);
      const r = z.from + (z.to - z.from) * ease.outCubic(z.t);
      this.camera.position.setLength(r);
      if (z.t >= 1) this.zoomAnim = null;
    }

    // Auto-rotate resumes smoothly after a few idle seconds.
    const idleFor = this.selectedId ? 9 : 2.5;
    const wantRotate =
      this.settings.autoRotate &&
      !this.interacting &&
      !this.focusAnim &&
      !this.reducedMotion &&
      this.time - this.lastInteraction > idleFor;
    this.autoSpeed = smooth(this.autoSpeed, wantRotate ? 0.45 : 0, 1.4, dt);
    c.autoRotate = Math.abs(this.autoSpeed) > 0.002;
    c.autoRotateSpeed = this.autoSpeed;

    // Gentler rotation when zoomed in.
    const dist = this.camera.position.length();
    c.rotateSpeed = THREE.MathUtils.clamp(0.18 + 0.42 * ((dist - 1.3) / (this.fitDistance - 1.3)), 0.12, 0.6);

    if (!this.focusAnim) c.update(dt);

    // ease view offset
    const vc = this.viewCenter;
    if (Math.abs(vc.x - vc.tx) > 0.3 || Math.abs(vc.y - vc.ty) > 0.3) {
      vc.x = smooth(vc.x, vc.tx, 5, dt);
      vc.y = smooth(vc.y, vc.ty, 5, dt);
      this._updateViewOffset();
    }
  }

  _updateMarkers(dt) {
    const t = this.time;
    const dist = this.camera.position.length();
    const scale = THREE.MathUtils.clamp(dist / 3.2, 0.45, 1.6);
    for (const m of this.markers.values()) {
      const active = m.item.id === this.selectedId;
      const hover = m.item.id === this.hoverId;
      m.emphasis = smooth(m.emphasis, active ? 1 : hover ? 0.6 : 0, 8, dt);
      const s = scale * (1 + m.emphasis * 0.7);
      m.dot.scale.setScalar(s);
      m.glow.scale.setScalar(0.055 * s * (1 + 0.15 * Math.sin(t * 2 + m.phase)));
      // pulsing ring: always faint, strong on selected
      const cycle = ((t * (active ? 0.75 : 0.45) + m.phase) % 1 + 1) % 1;
      m.ring.scale.setScalar(scale * (0.012 + cycle * (active ? 0.05 : 0.026)));
      m.ring.material.opacity = (1 - cycle) * (m.isOrigin ? 0.35 : 0.25 + m.emphasis * 0.75);
    }
    if (this.beam.visible) {
      this.beamUniforms.uOpacity.value = smooth(this.beamUniforms.uOpacity.value, 0.9, 3, dt);
      this.beam.scale.set(scale, scale, scale * (0.9 + 0.1 * Math.sin(t * 3)));
    }
  }

  _updateRoutes(dt) {
    const target = this.settings.flightPath ? 1 : 0;
    this.routeOpacity = smooth(this.routeOpacity, target, 6, dt);
    this.routeGroup.visible = this.routeOpacity > 0.01;
    for (const leg of this.legs) {
      const p = THREE.MathUtils.clamp((this.time - leg.start) / leg.drawTime, 0, 1);
      const prog = ease.outCubic(p);
      for (const mesh of [leg.mesh, leg.glow]) {
        const u = mesh.material.uniforms;
        u.uProgress.value = prog;
        u.uTime.value = this.time;
        u.uOpacity.value = (leg.preview ? 0.7 : 1) * this.routeOpacity;
      }
    }

    // Aircraft
    const f = this.flight;
    if (!this.legs.length || !this.settings.flightPath) {
      this.plane.visible = false;
      return;
    }
    if (f.pause > 0) {
      f.pause -= dt;
      this.plane.visible = false;
      return;
    }
    const speed = 0.22; // world units / second
    f.t += dt * speed;
    if (f.t > f.total) {
      f.t = 0;
      f.pause = 0.7;
      this.plane.visible = false;
      return;
    }
    let leg = this.legs[this.legs.length - 1];
    for (const l of this.legs) if (f.t <= l.cumStart + l.length) { leg = l; break; }
    const raw = THREE.MathUtils.clamp((f.t - leg.cumStart) / leg.length, 0, 1);
    const u = THREE.MathUtils.clamp(ease.inOutSine(raw), 0.0005, 0.9995);
    const pos = leg.curve.getPointAt(u);
    const tan = leg.curve.getTangentAt(u).normalize();
    const up = pos.clone().normalize();
    const y = up.clone().addScaledVector(tan, -up.dot(tan)).normalize();
    const x = new THREE.Vector3().crossVectors(y, tan);
    const m = new THREE.Matrix4().makeBasis(x, y, tan);
    this.plane.quaternion.setFromRotationMatrix(m);
    // gentle bank
    this.plane.rotateZ(Math.sin(this.time * 1.3) * 0.08);
    this.plane.position.copy(pos).addScaledVector(up, 0.012);
    const dist = this.camera.position.length();
    this.plane.scale.setScalar(0.068 * THREE.MathUtils.clamp(dist / 3.2, 0.45, 1.4));
    const facing = up.dot(this.camera.position.clone().sub(pos).normalize());
    this.plane.visible = facing > -0.35 || pos.length() > 1.08;
    const blink = Math.sin(this.time * 9) > 0.6;
    this.plane.userData.navLights.forEach((l) => (l.visible = blink));
  }

  _updateLabels() {
    if (!this.labels) return;
    const { w, h } = this.size;
    const v = this._labelV || (this._labelV = new THREE.Vector3());
    for (const [id, el] of this.labels) {
      const m = this.markers.get(id);
      if (!m) continue;
      const facing = this._facing(m);
      const op = THREE.MathUtils.smoothstep(facing, 0.04, 0.28);
      if (op < 0.02) {
        if (!el._hidden) {
          el.classList.add('is-hidden');
          el._hidden = true;
        }
        continue;
      }
      if (el._hidden) {
        el.classList.remove('is-hidden');
        el._hidden = false;
      }
      v.copy(m.world).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.opacity = op.toFixed(3);
      el.style.zIndex = String(Math.round(facing * 100) + (id === this.selectedId ? 200 : 0));
    }
  }

  _adaptQuality(dt) {
    const p = this.perf;
    p.frames++;
    p.acc += dt;
    if (p.acc < 2) return;
    const avg = p.acc / p.frames;
    p.frames = 0;
    p.acc = 0;
    if (avg > 1 / 40 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      p.lastChange = this.time;
    } else if (avg < 1 / 57 && this.pixelRatio < this.maxPixelRatio && this.time - p.lastChange > 8) {
      this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.25);
      p.lastChange = this.time;
    } else return;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.starUniforms.uPixelRatio.value = this.pixelRatio;
    this.resize();
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;

    this._updateCamera(dt);
    this._updateSun(dt);

    // clouds drift slowly eastward relative to the surface
    if (!this.reducedMotion) this.clouds.rotation.y += dt * 0.006;
    const cloudTarget = this.settings.clouds ? 1 : 0;
    const co = smooth(this.cloudUniforms.uOpacity.value, cloudTarget, 5, dt);
    this.cloudUniforms.uOpacity.value = co;
    this.clouds.visible = co > 0.01;
    this.earthUniforms.uCloudShadow.value = co;
    this.earthUniforms.uCloudOffset.value = -this.clouds.rotation.y / TAU;
    this.starUniforms.uTime.value = this.time;

    this._updateMarkers(dt);
    this._updateRoutes(dt);

    this.renderer.render(this.scene, this.camera);
    this._updateLabels();
    this._adaptQuality(dt);
  }
}
