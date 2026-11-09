// Mundo 3D low-poly da história do seu Alfredo (three.js).
// Expõe window.preparar(timeline) e window.renderAt(t) -> dataURL JPEG.
import * as THREE from 'three';

await document.fonts.load('40px Anton');
const W = window.LARGURA || 720, H = window.ALTURA || 1280;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 2000);

// ------------------------------------------------------------------ utilidades
const mats = {};
function mat(cor, extra = {}) {
  const k = cor + JSON.stringify(extra);
  if (!mats[k]) mats[k] = new THREE.MeshStandardMaterial({ color: cor, flatShading: true, roughness: 0.8, ...extra });
  return mats[k];
}
function malha(geo, cor, extra) {
  const m = new THREE.Mesh(geo, cor instanceof THREE.Material ? cor : mat(cor, extra));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const box = (w, h, d, cor, ex) => malha(new THREE.BoxGeometry(w, h, d), cor, ex);
const esfera = (r, cor, det = 1, ex) => malha(new THREE.IcosahedronGeometry(r, det), cor, ex);
const cil = (rt, rb, h, cor, seg = 8, ex) => malha(new THREE.CylinderGeometry(rt, rb, h, seg), cor, ex);
const cone = (r, h, cor, seg = 6, ex) => malha(new THREE.ConeGeometry(r, h, seg), cor, ex);
function em(obj, x, y, z, pai) { obj.position.set(x, y, z); if (pai) pai.add(obj); return obj; }
const lerp = (a, b, u) => a + (b - a) * u;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const suave = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
let rngSeed = 7;
const rnd = () => { rngSeed = (rngSeed * 16807) % 2147483647; return (rngSeed - 1) / 2147483646; };

function texto(txt, w, h, { bg = '#ffd400', fg = '#222', borda = '#222', tam = 0.62 } = {}) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * 160); c.height = Math.round(h * 160);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.lineWidth = c.height * 0.08; g.strokeStyle = borda; g.strokeRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const linhas = txt.split('\n');
  let fs = c.height * tam / linhas.length;
  g.font = `${fs}px Anton`;
  while (Math.max(...linhas.map(l => g.measureText(l).width)) > c.width * 0.9) { fs *= 0.92; g.font = `${fs}px Anton`; }
  linhas.forEach((l, i) => g.fillText(l, c.width / 2, c.height * (i + 0.5) / linhas.length + fs * 0.04));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  return m;
}
function emissivo(cor, intens = 2) {
  return new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: intens, flatShading: true });
}

// ------------------------------------------------------------------ personagens
function pessoa(o = {}) {
  const p = { g: new THREE.Group(), o };
  const pele = o.pele ?? 0xc68642;
  const camisa = o.camisa ?? 0x3366cc;
  const calca = o.calca ?? 0x334455;
  const alien = !!o.alien;
  // pernas
  for (const lado of [-1, 1]) {
    const piv = em(new THREE.Group(), 0.13 * lado, 0.8, 0, p.g);
    em(box(0.2, 0.78, 0.22, alien ? pele : calca), 0, -0.39, 0, piv);
    em(box(0.24, 0.12, 0.34, alien ? 0x2c6e2c : (o.sapato ?? 0x3b2314)), 0, -0.76, 0.05, piv);
    p[lado < 0 ? 'pernaE' : 'pernaD'] = piv;
  }
  // corpo
  if (o.vestido) {
    em(cil(0.26, 0.5, 0.75, o.vestido, 8), 0, 0.72, 0, p.g);
    em(box(0.5, 0.45, 0.3, o.vestido), 0, 1.25, 0, p.g);
  } else if (o.batina) {
    em(cil(0.3, 0.48, 1.2, o.batina, 8), 0, 0.85, 0, p.g);
    em(box(0.56, 0.4, 0.32, o.batina), 0, 1.3, 0, p.g);
    em(box(0.14, 0.06, 0.02, 0xffffff), 0, 1.47, 0.17, p.g);
  } else {
    em(box(alien ? 0.38 : 0.58, 0.68, alien ? 0.26 : 0.34, alien ? pele : camisa), 0, 1.15, 0, p.g);
  }
  p.corpo = p.g.children[p.g.children.length - 1];
  // braços
  for (const lado of [-1, 1]) {
    const piv = em(new THREE.Group(), (alien ? 0.26 : 0.37) * lado, 1.44, 0, p.g);
    em(box(0.15, 0.6, 0.16, alien ? pele : (o.manga ?? o.vestido ?? o.batina ?? camisa)), 0, -0.3, 0, piv);
    em(esfera(0.1, pele, 0), 0, -0.64, 0, piv);
    p[lado < 0 ? 'bracoE' : 'bracoD'] = piv;
  }
  // cabeça
  const cab = em(new THREE.Group(), 0, 1.8, 0, p.g); p.cab = cab;
  const cranio = esfera(alien ? 0.42 : 0.34, pele, 1);
  if (alien) cranio.scale.set(1.05, 1.25, 1);
  em(cranio, 0, alien ? 0.12 : 0, 0, cab);
  if (alien) {
    for (const lado of [-1, 1]) {
      const olho = esfera(0.13, 0x050505, 1, { roughness: 0.1, metalness: 0.3 });
      olho.scale.set(1.0, 0.6, 0.4); olho.rotation.z = 0.5 * lado;
      em(olho, 0.17 * lado, 0.12, 0.36, cab);
    }
    const ant = em(cil(0.015, 0.015, 0.35, 0x2c6e2c, 4), 0, 0.72, 0, cab);
    em(esfera(0.06, emissivo(0xff3366, 1.5), 0), 0, 0.9, 0, cab);
  } else {
    for (const lado of [-1, 1]) {
      em(esfera(0.075, 0xffffff, 1), 0.12 * lado, 0.07, 0.29, cab);
      em(esfera(0.038, 0x111111, 0), 0.12 * lado, 0.07, 0.355, cab);
    }
    p.nariz = em(esfera(o.narizGrande ? 0.085 : 0.06, o.nariz ?? pele, 0), 0, -0.02, 0.34, cab);
  }
  const boca = em(box(alien ? 0.08 : 0.16, 0.05, 0.04, 0x5a1010), 0, alien ? -0.2 : -0.14, alien ? 0.36 : 0.3, cab);
  p.boca = boca;
  if (o.bigode) em(box(0.24, 0.06, 0.06, o.bigode), 0, -0.09, 0.33, cab);
  if (o.cabelo) {
    const cb = em(esfera(0.36, o.cabelo, 1), 0, 0.09, -0.04, cab); cb.scale.set(1, 0.8, 1);
  }
  if (o.cachos) {
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * (0.05 + 0.9 * i / 10);
      em(esfera(0.15, o.cachos, 0), Math.cos(a) * 0.36, 0.05 + Math.sin(i * 1.7) * 0.08, -Math.sin(a) * 0.3, cab);
    }
    em(esfera(0.24, o.cachos, 0), 0, 0.3, -0.12, cab);
  }
  if (o.lenco) { const l = em(cil(0.36, 0.37, 0.16, o.lenco, 10), 0, 0.24, -0.02, cab); l.rotation.x = -0.25; }
  if (o.turbante) {
    const t = em(esfera(0.38, o.turbante, 1), 0, 0.22, -0.02, cab); t.scale.set(1, 0.85, 1);
    em(esfera(0.18, o.turbante, 0), 0.05, 0.5, 0.05, cab);
  }
  if (o.chapeu) {
    em(cil(0.6, 0.6, 0.04, o.chapeu, 10), 0, 0.22, 0, cab);
    em(cil(0.26, 0.32, 0.28, o.chapeu, 8), 0, 0.36, 0, cab);
    em(cil(0.325, 0.325, 0.07, 0xb22222, 8), 0, 0.26, 0, cab);
  }
  if (o.brincos) for (const lado of [-1, 1]) em(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 4, 10), mat(0xffd700, { metalness: 0.8, roughness: 0.3 })), 0.33 * lado, -0.12, 0, cab);
  if (o.colar) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.2;
      em(esfera(0.04, [0xff4444, 0xffffff, 0x3399ff, 0xffd400][i % 4], 0), Math.sin(a) * 0.24, 1.42 - Math.cos(a) * 0.12, 0.18, p.g);
    }
  }
  // acessórios alternáveis
  p.oculos = new THREE.Group(); em(p.oculos, 0, 0.07, 0.34, cab);
  for (const lado of [-1, 1]) {
    em(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.015, 4, 12), mat(0x111111)), 0.12 * lado, 0, 0, p.oculos);
  }
  em(box(0.08, 0.02, 0.02, 0x111111), 0, 0, 0, p.oculos);
  p.oculos.visible = false;
  p.oculosSol = new THREE.Group(); em(p.oculosSol, 0, 0.07, 0.35, cab);
  em(box(0.42, 0.11, 0.03, 0x111111, { metalness: 0.6, roughness: 0.2 }), 0, 0, 0, p.oculosSol);
  p.oculosSol.visible = false;
  p.corrente = new THREE.Group(); em(p.corrente, 0, 1.33, 0.19, p.g);
  for (let i = 0; i < 11; i++) {
    const a = (i / 10 - 0.5) * 2.4;
    em(esfera(0.035, mat(0xffd700, { metalness: 1, roughness: 0.25 }), 0), Math.sin(a) * 0.22, -Math.cos(a) * 0.16 + 0.12, 0, p.corrente);
  }
  em(box(0.12, 0.14, 0.03, mat(0xffd700, { metalness: 1, roughness: 0.25 })), 0, -0.07, 0.02, p.corrente);
  p.corrente.visible = false;
  // objeto na mão direita
  p.mao = em(new THREE.Group(), 0, -0.68, 0.06, p.bracoD);
  p.g.traverse(m => { if (m.isMesh) { m.castShadow = true; } });
  return p;
}
function copo(cor = 0xf5f5dc, h = 0.16) {
  const g = new THREE.Group();
  em(cil(0.06, 0.05, h, new THREE.MeshStandardMaterial({ color: 0xddeeff, transparent: true, opacity: 0.45 }), 8), 0, h / 2, 0, g);
  em(cil(0.055, 0.045, h * 0.7, cor, 8), 0, h * 0.35, 0, g);
  return g;
}
function garrafa() {
  const g = new THREE.Group();
  em(cil(0.07, 0.07, 0.3, mat(0x2e8b57, { roughness: 0.2 }), 8), 0, 0.15, 0, g);
  em(cil(0.025, 0.06, 0.12, mat(0x2e8b57, { roughness: 0.2 }), 8), 0, 0.36, 0, g);
  return g;
}

// postura padrão / animações
function pose(p, { andar = 0, fase = 0, bambo = 0, bracos = 0, acenar = 0 } = {}) {
  const s = Math.sin(fase);
  p.pernaE.rotation.x = s * andar; p.pernaD.rotation.x = -s * andar;
  p.bracoE.rotation.x = -s * andar * 0.9; p.bracoD.rotation.x = s * andar * 0.9;
  p.bracoE.rotation.z = -0.08 - bracos; p.bracoD.rotation.z = 0.08 + bracos;
  if (acenar) { p.bracoD.rotation.z = 2.6 + Math.sin(fase * 1.5) * 0.35 * acenar; p.bracoD.rotation.x = 0; }
  p.g.rotation.z = Math.sin(fase * 0.5) * bambo * 0.12;
  p.cab.rotation.z = Math.sin(fase * 0.7 + 1) * bambo * 0.2;
  p.g.children.forEach(() => {});
}
function falar(p, ativo, t) {
  const v = ativo ? 0.5 + 0.5 * Math.abs(Math.sin(t * 17)) * (0.6 + 0.4 * Math.sin(t * 5.3)) : 0;
  p.boca.scale.y = 1 + v * 4;
  if (ativo) p.cab.rotation.x = Math.sin(t * 6) * 0.06; else p.cab.rotation.x *= 0.5;
}

// ------------------------------------------------------------------ céu
function gradiente(cores) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 512);
  cores.forEach(([p, cor]) => gr.addColorStop(p, cor));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const CEU = {
  noite: gradiente([[0, '#120a3a'], [0.55, '#3b2a8f'], [0.8, '#7a4fc4'], [1, '#e07ab8']]),
  dia: gradiente([[0, '#2f8fff'], [0.6, '#7cc6ff'], [1, '#d8f2ff']]),
  aurora: gradiente([[0, '#3a6fd8'], [0.5, '#f7a8c4'], [0.8, '#ffc27a'], [1, '#ffe7a8']]),
  nave: gradiente([[0, '#12002a'], [1, '#2a0a55']]),
};

// ------------------------------------------------------------------ luzes
const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.3); scene.add(hemi);
const sol = new THREE.DirectionalLight(0xffffff, 2.5); sol.castShadow = true;
sol.shadow.mapSize.set(1024, 1024); sol.shadow.bias = -0.0005;
scene.add(sol); scene.add(sol.target);
function sombraEm(x, z, r = 40) {
  sol.target.position.set(x, 0, z); sol.position.set(x + 30, 50, z + 25);
  const c = sol.shadow.camera; c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 160; c.updateProjectionMatrix();
}

// ------------------------------------------------------------------ cidade (origem)
const cidade = new THREE.Group(); scene.add(cidade);
function terreno(tam, seg, cor, amp, pai, plano = 0) {
  const geo = new THREE.PlaneGeometry(tam, tam, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.sqrt(x * x + z * z);
    const k = clamp((d - plano) / 40) * (x > 15 ? clamp((Math.abs(z) - 9) / 30) : 1);
    pos.setY(i, (Math.sin(x * 0.08) * Math.cos(z * 0.07) * amp + (rnd() - 0.5) * 1.2) * k);
  }
  geo.computeVertexNormals();
  const m = malha(geo, cor); m.castShadow = false; pai.add(m); return m;
}
terreno(600, 70, 0x5cb85c, 10, cidade, 70);
// montanhas
for (let i = 0; i < 22; i++) {
  const a = i / 22 * Math.PI * 2; const r = 230 + rnd() * 60;
  const m = cone(30 + rnd() * 30, 50 + rnd() * 60, [0x3f8f4f, 0x2f7f5f, 0x4a9a3a][i % 3], 5);
  m.castShadow = false; em(m, Math.cos(a) * r, 15, Math.sin(a) * r, cidade);
}
// rua
const rua = box(70, 0.05, 6, 0xcfa070); rua.castShadow = false; em(rua, 0, 0.03, 0, cidade);
const estrada = box(110, 0.05, 4, 0xc8955a); estrada.castShadow = false; em(estrada, 88, 0.03, 0, cidade);
const praca = cil(9, 9, 0.12, 0xe8d8b0, 12); praca.castShadow = false; em(praca, 0, 0.06, 13, cidade);
const coresCasa = [0xffd166, 0x4fc3f7, 0xff8fab, 0xffffff, 0x9be15d, 0xffa94d, 0xc77dff, 0x80ffdb];
const coresPorta = [0x1d4ed8, 0xd62828, 0x2a9d8f, 0x6a4c93, 0xe76f51];
const janelasNoite = [];
function casa(x, z, rotY, cor, w = 6, h = 4.5, d = 5) {
  const g = new THREE.Group();
  em(box(w, h, d, cor), 0, h / 2, 0, g);
  const telhado = malha(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.2, 4), 0xc1440e);
  telhado.rotation.y = Math.PI / 4; telhado.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  em(telhado, 0, h + 1.1, 0, g);
  em(box(1.2, 2.3, 0.1, coresPorta[Math.floor(rnd() * 5)]), 0, 1.15, d / 2 + 0.05, g);
  for (const lado of [-1, 1]) {
    const jan = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x8ecae6, emissive: 0xffb347, emissiveIntensity: 0 }));
    em(jan, lado * w * 0.3, h * 0.6, d / 2 + 0.06, g); janelasNoite.push(jan);
    em(box(1.4, 0.15, 0.2, 0xffffff), lado * w * 0.3, h * 0.6 - 0.65, d / 2 + 0.1, g);
  }
  g.position.set(x, 0, z); g.rotation.y = rotY; cidade.add(g); return g;
}
let ci = 0;
for (let x = -30; x <= 30; x += 7.5) {
  if (Math.abs(x - 7.5) < 1) { ci++; continue; }
  casa(x, -9, 0, coresCasa[ci++ % 8]);
  if (Math.abs(x) > 8) casa(x, 9, Math.PI, coresCasa[ci++ % 8]);
}
// igreja
const igreja = new THREE.Group(); em(igreja, -0.5, 0, 28, cidade); igreja.rotation.y = Math.PI;
em(box(9, 7, 12, 0xffffff), 0, 3.5, 0, igreja);
em(box(9.2, 0.5, 12.2, 0x1d70b8), 0, 7.1, 0, igreja);
const telhadoIg = cone(7.5, 3, 0xc1440e, 4); telhadoIg.rotation.y = Math.PI / 4; telhadoIg.scale.set(0.85, 1, 1.1); em(telhadoIg, 0, 8.8, 0, igreja);
em(box(3.4, 13, 3.4, 0xffffff), 0, 6.5, 6.5, igreja);
em(cone(2.6, 3.5, 0x1d70b8, 4), 0, 14.7, 6.5, igreja).rotation.y = Math.PI / 4;
em(box(0.3, 2, 0.3, 0xffd700), 0, 17.3, 6.5, igreja); em(box(1.2, 0.3, 0.3, 0xffd700), 0, 17.6, 6.5, igreja);
em(box(2, 3.2, 0.1, 0x1d70b8), 0, 1.6, 8.25, igreja);
// árvores
function arvore(x, z, s = 1, pai = cidade) {
  const g = new THREE.Group();
  em(cil(0.25 * s, 0.35 * s, 2.2 * s, 0x8b5a2b, 6), 0, 1.1 * s, 0, g);
  em(esfera(1.6 * s, [0x2e9e44, 0x3cb043, 0x4caf50][Math.floor(rnd() * 3)], 0), 0, 3 * s, 0, g);
  g.position.set(x, 0, z); pai.add(g); return g;
}
for (let i = 0; i < 70; i++) {
  const x = -80 + rnd() * 220, z = (rnd() < 0.5 ? -1 : 1) * (16 + rnd() * 60);
  if (Math.abs(z - 20) < 12 && Math.abs(x) < 12) continue;
  arvore(x, z, 0.8 + rnd() * 0.7);
}
// postes
const lampadas = [];
for (let x = -26; x <= 26; x += 13) {
  for (const z of [-3.6, 3.6]) {
    em(cil(0.08, 0.1, 4.5, 0x333333, 6), x, 2.25, z, cidade);
    const l = em(esfera(0.28, new THREE.MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffd27a, emissiveIntensity: 0 }), 1), x, 4.6, z, cidade);
    lampadas.push(l);
  }
}
const luzesPoste = [];
for (const [x, z] of [[-13, -3.6], [0, 3.6], [13, -3.6], [26, 3.6]]) {
  const pl = new THREE.PointLight(0xffb347, 0, 18, 1.5); em(pl, x, 4.4, z, cidade); luzesPoste.push(pl);
}
// cerca do pasto
for (let x = 40; x < 140; x += 3) for (const z of [-2.6, 2.6]) {
  em(box(0.15, 1.1, 0.15, 0x8b5a2b), x, 0.55, z, cidade);
  em(box(3, 0.1, 0.08, 0xa0703a), x + 1.5, 0.85, z, cidade);
}
// Bar do Zé (boteco aberto)
const bar = new THREE.Group(); em(bar, 7.5, 0, -9, cidade);
em(box(7, 4.6, 5, 0xff6b35), 0, 2.3, 0, bar);
em(box(5.2, 2.6, 0.2, 0x3b1f0e), 0, 2.2, 2.45, bar).material = mat(0x2a1607);
em(box(7.6, 0.25, 2.2, 0x2a9d8f), 0, 4.5, 3.3, bar);
const placaBar = texto('BAR DO ZÉ', 4.6, 1.1, { bg: '#ffd400', fg: '#c1121f' }); em(placaBar, 0, 3.9, 2.62, bar);
em(box(6, 1.1, 0.8, 0x8b4513), 0, 0.55, 3.75, bar);
em(box(6.2, 0.12, 1, 0xd2a679), 0, 1.15, 3.75, bar);
em(box(5, 0.1, 0.4, 0x8b5a2b), 0, 1.75, 2.75, bar);
for (let i = 0; i < 6; i++) { const gf = garrafa(); em(gf, -2.2 + i * 0.9, 1.8, 2.75, bar); gf.scale.setScalar(1.4); }
for (const x of [-2, 0, 2]) { em(cil(0.3, 0.3, 0.08, 0xc1121f, 8), x, 0.85, 4.8, bar); em(cil(0.06, 0.06, 0.8, 0x333333, 4), x, 0.42, 4.8, bar); }
const luzBar = new THREE.PointLight(0xffc477, 0, 14, 1.4); em(luzBar, 0, 3.4, 4.5, bar);
// estrelas
const estrelasGeo = new THREE.BufferGeometry(); const ep = [];
for (let i = 0; i < 1600; i++) {
  const th = rnd() * Math.PI * 2, ph = rnd() * 1.3;
  ep.push(Math.cos(th) * Math.sin(ph) * 700, Math.cos(ph) * 700 + 30, Math.sin(th) * Math.sin(ph) * 700);
}
estrelasGeo.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
const estrelas = new THREE.Points(estrelasGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false }));
scene.add(estrelas);

// ------------------------------------------------------------------ disco voador
function discoVoador() {
  const d = { g: new THREE.Group(), luzes: [] };
  const corpo = malha(new THREE.LatheGeometry([new THREE.Vector2(0, -0.6), new THREE.Vector2(2.2, -0.5), new THREE.Vector2(4, 0), new THREE.Vector2(2.4, 0.5), new THREE.Vector2(0, 0.6)], 14), mat(0xc0c8d8, { metalness: 0.7, roughness: 0.3 }));
  d.g.add(corpo);
  const cupula = malha(new THREE.SphereGeometry(1.7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x66fff0, emissive: 0x22ccbb, emissiveIntensity: 1.2, transparent: true, opacity: 0.85, flatShading: true }));
  em(cupula, 0, 0.45, 0, d.g);
  const cores = [0xff3366, 0xffd400, 0x33ff99, 0x33ccff, 0xcc66ff];
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const l = em(esfera(0.22, emissivo(cores[i % 5], 3), 0), Math.cos(a) * 3.6, -0.05, Math.sin(a) * 3.6, d.g);
    d.luzes.push(l);
  }
  const raioMat = new THREE.MeshBasicMaterial({ color: 0xc8ff7a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  d.raio = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.6, 14, 16, 1, true), raioMat);
  em(d.raio, 0, -7.3, 0, d.g); d.raio.visible = false;
  d.luz = new THREE.PointLight(0xaaff88, 0, 40, 1.2); em(d.luz, 0, -3, 0, d.g);
  return d;
}
const ufo = discoVoador(); scene.add(ufo.g);
function animarDisco(d, t) {
  d.luzes.forEach((l, i) => { l.material.emissiveIntensity = 1.5 + 2.5 * (0.5 + 0.5 * Math.sin(t * 8 - i * 0.9)); });
  d.g.children[0].rotation.y = t * 0.8;
}

// ------------------------------------------------------------------ elenco
const alfredo = pessoa({ pele: 0xd9a066, camisa: 0xd62828, calca: 0x6b4226, bigode: 0x8a8a8a, chapeu: 0xe9c46a, nariz: 0xe63946, narizGrande: true });
const ze = pessoa({ pele: 0x8d5524, camisa: 0xffffff, calca: 0x264653, bigode: 0x1b1b1b, cabelo: 0x1b1b1b });
const cleide = pessoa({ pele: 0x7a4a2a, vestido: 0xff2e93, cachos: 0x1a0f0a, brincos: true, lenco: 0xffd400 });
const padre = pessoa({ pele: 0xe0ac69, batina: 0x1b1b1b, cabelo: 0x9e9e9e });
const pastor = pessoa({ pele: 0xc68642, camisa: 0x1f3a93, calca: 0x1f3a93, cabelo: 0x1b1b1b, manga: 0x1f3a93 });
const maeSanto = pessoa({ pele: 0x5c3317, vestido: 0xffffff, turbante: 0xffffff, colar: true });
const prefeito = pessoa({ pele: 0xf1c27d, camisa: 0x2b2d42, calca: 0x2b2d42, cabelo: 0x5a3a1a, bigode: 0x5a3a1a });
const aliens = [0, 1, 2].map(() => pessoa({ alien: true, pele: 0x7ddc5a }));
const povo = [];
const corPovo = [0xff595e, 0x1982c4, 0x8ac926, 0xffca3a, 0x6a4c93, 0xff924c, 0x52b788, 0xf72585];
const pelePovo = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x5c3317];
for (let i = 0; i < 16; i++) povo.push(pessoa({ pele: pelePovo[i % 5], camisa: corPovo[i % 8], calca: [0x264653, 0x3d405b, 0x6b4226][i % 3], cabelo: [0x1b1b1b, 0x5a3a1a, 0xd4a017][i % 3], vestido: i % 4 === 1 ? corPovo[(i + 3) % 8] : undefined }));
const elenco = [alfredo, ze, cleide, padre, pastor, maeSanto, prefeito, ...aliens, ...povo];
elenco.forEach(p => scene.add(p.g));
const mapaVoz = { alfredo, alfredo2: alfredo, cleide, alien: aliens[1], coro: null };

// objetos de cena
const copoPinga = copo(0xfff3c4); alfredo.mao.add(copoPinga);
const copoSuco = copo(0xff9f1c, 0.2); alfredo.mao.add(copoSuco);
const garrafaAlf = garrafa(); em(garrafaAlf, 0, -0.05, 0, alfredo.mao); garrafaAlf.rotation.x = Math.PI;
const prancheta = box(0.35, 0.45, 0.04, 0x8b5a2b); em(prancheta, 0, 0, 0.1, prefeito.mao);
const biblia = box(0.25, 0.32, 0.08, 0x1b1b1b); em(biblia, 0, 0, 0.08, pastor.mao);

// ------------------------------------------------------------------ turismo (parte 3)
const turismo = new THREE.Group(); cidade.add(turismo);
const etGigante = pessoa({ alien: true, pele: 0x7ddc5a }); etGigante.g.scale.setScalar(3.2); em(etGigante.g, -7, 0.6, 13, turismo); etGigante.g.rotation.y = 0.5;
etGigante.bracoD.rotation.z = 2.6;
em(cil(2.2, 2.4, 0.6, 0xdddddd, 10), -7, 0.3, 13, turismo);
const faixa = texto('CAFUNDÓ DAS GERAIS\nCAPITAL DOS ETs', 9, 3.2, { bg: '#7ddc5a', fg: '#1b1b1b' });
em(faixa, -34.5, 8.5, 0, turismo); faixa.rotation.y = -Math.PI / 2;
for (const z of [-4.7, 4.7]) em(cil(0.12, 0.12, 9, 0x555555, 6), -34.6, 4.5, z, turismo);
const discosTelhado = [];
for (const [x, z] of [[-22.5, -9], [15, 9], [-15, 9], [30, -9]]) {
  const d = discoVoador(); d.g.scale.setScalar(0.45); em(d.g, x, 7.4, z, turismo); discosTelhado.push(d);
}
const onibus = new THREE.Group(); em(onibus, 60, 0, 1.5, turismo); onibus.rotation.y = Math.PI;
em(box(10, 3.2, 2.8, 0x00a6fb), 0, 2.1, 0, onibus);
em(box(9.6, 1, 2.85, 0xbde0fe), 0, 2.8, 0, onibus);
for (const x of [-3.2, 3.2]) for (const z of [-1.4, 1.4]) { const r = cil(0.55, 0.55, 0.4, 0x1b1b1b, 10); r.rotation.x = Math.PI / 2; em(r, x, 0.55, z, onibus); }
const placaOnibus = texto('TURISMO ET', 4, 0.8, { bg: '#ffffff', fg: '#00a6fb' }); em(placaOnibus, 0, 1.3, 1.45, onibus);
const barraca = new THREE.Group(); em(barraca, -14, 0, 4.5, turismo);
em(box(3.2, 1.1, 1.2, 0xffffff), 0, 0.55, 0, barraca);
em(texto('PÃO DE QUEIJO ET', 3.2, 0.6, { bg: '#ff2e93', fg: '#fff' }), 0, 2.6, 0.3, barraca);
for (const x of [-1.5, 1.5]) em(cil(0.06, 0.06, 2.4, 0x555555, 4), x, 1.2, 0.5, barraca);
em(box(3.6, 0.1, 1.8, 0xff2e93), 0, 2.3, 0.2, barraca);
for (let i = 0; i < 6; i++) em(esfera(0.13, 0x9be15d, 0), -1 + i * 0.4, 1.22, 0.1, barraca);
const palco = new THREE.Group(); em(palco, 3, 0, 17.3, turismo); palco.rotation.y = Math.PI;
em(box(6, 0.8, 3.5, 0xffd400), 0, 0.4, 0, palco);
em(texto('ALFREDO\nTURISMO ESPACIAL', 5, 1.6, { bg: '#1b1b1b', fg: '#ffd400' }), 0, 4.5, -1.6, palco);
for (const x of [-2.8, 2.8]) em(cil(0.08, 0.08, 4, 0x777777, 4), x, 2.4, -1.6, palco);
turismo.visible = false;

// ------------------------------------------------------------------ casa da dona Cleide (x = -1000)
const vila = new THREE.Group(); em(vila, -1000, 0, 0, scene);
const chaoVila = box(80, 0.2, 80, 0x9be15d); chaoVila.castShadow = false; em(chaoVila, 0, -0.1, 0, vila);
em(box(16, 0.06, 6, 0xbfa58a), 0, 0.02, 1.5, vila);
const casaC = new THREE.Group(); em(casaC, 0, 0, -4, vila);
em(box(7, 4, 4.5, 0xf4a261), 0, 2, 0, casaC);
em(box(7.6, 0.25, 5.2, 0x8ecae6), 0, 4.15, 0.2, casaC);
em(box(1.3, 2.4, 0.1, 0x2a9d8f), -1.6, 1.2, 2.3, casaC);
em(box(1.5, 1.1, 0.1, 0x219ebc), 1.6, 2.2, 2.3, casaC);
for (let i = 0; i < 12; i++) em(box(0.6, 0.3, 0.05, 0xe76f51), -3 + (i % 6) * 1.2 + (Math.floor(i / 6) % 2) * 0.6, 0.6 + Math.floor(i / 6) * 0.45, 2.27, casaC);
// varal
for (const x of [-5.5, 5.5]) em(cil(0.06, 0.06, 2.6, 0x8b5a2b, 4), x, 1.3, 1, vila);
em(box(11, 0.02, 0.02, 0xffffff), 0, 2.5, 1, vila);
const roupas = [];
[0xff595e, 0xffca3a, 0x1982c4, 0x8ac926, 0xf72585, 0xffffff].forEach((c, i) => {
  const r = box(0.9, 1, 0.04, c); em(r, -4.2 + i * 1.6, 1.98, 1, vila); roupas.push(r);
});
for (const [x, z] of [[-6, -1], [6.5, -1.5]]) { em(cil(0.35, 0.28, 0.5, 0xc1440e, 6), x, 0.25, z, vila); em(esfera(0.5, 0x2e9e44, 0), x, 0.85, z, vila); }
arvore(-9, -6, 1.2, vila); arvore(10, -7, 1.4, vila);
const barracaC = new THREE.Group(); em(barracaC, 2.7, 0, 0.8, vila);
em(box(2.4, 1, 1, 0xffffff), 0, 0.5, 0, barracaC);
em(texto('PÃO DE QUEIJO ET\nR$ 5', 2.6, 0.8, { bg: '#7ddc5a', fg: '#1b1b1b' }), 0, 2.15, 0.25, barracaC);
for (const x of [-1.1, 1.1]) em(cil(0.05, 0.05, 2.2, 0x555555, 4), x, 1.1, 0.45, barracaC);
for (let i = 0; i < 5; i++) em(esfera(0.12, 0x9be15d, 0), -0.8 + i * 0.4, 1.1, 0.1, barracaC);
const etMini = pessoa({ alien: true, pele: 0x7ddc5a }); etMini.g.scale.setScalar(0.45); em(etMini.g, 1.6, 1, 0.8, barracaC);
barracaC.visible = false;

// ------------------------------------------------------------------ interior da nave (x = 1000)
const nave = new THREE.Group(); em(nave, 1000, 0, 0, scene);
const parede = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 10, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x5b2a86, side: THREE.BackSide, flatShading: true, metalness: 0.4, roughness: 0.5 }));
em(parede, 0, 5, 0, nave);
const chaoN = malha(new THREE.CylinderGeometry(13, 13, 0.2, 12), 0x2d1b4e); chaoN.castShadow = false; em(chaoN, 0, -0.1, 0, nave);
const teto = malha(new THREE.CylinderGeometry(13, 13, 0.2, 12), 0x24123f); em(teto, 0, 10, 0, nave);
for (let i = 0; i < 12; i++) {
  const a = i / 12 * Math.PI * 2;
  const faixaL = em(box(0.25, 8, 0.2, emissivo([0x00f5d4, 0xf15bb5, 0xfee440][i % 3], 2.2)), Math.cos(a) * 12.6, 5, Math.sin(a) * 12.6, nave);
  faixaL.rotation.y = -a;
}
const anelChao = new THREE.Mesh(new THREE.TorusGeometry(5, 0.12, 4, 24), emissivo(0x00f5d4, 3)); anelChao.rotation.x = Math.PI / 2; em(anelChao, 0, 0.05, 0, nave);
const mesa = new THREE.Group(); em(mesa, 0, 0, 0, nave);
em(cil(0.6, 0.9, 1, 0x9d4edd, 8), 0, 0.5, 0, mesa);
em(box(1.6, 0.25, 3.4, 0xe0e0e0, { metalness: 0.5 }), 0, 1.1, 0, mesa);
const scanner = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 6, 20), emissivo(0x00f5d4, 3)); em(scanner, 0, 1.4, 0, nave); scanner.visible = false;
const telaQI = new THREE.Group(); em(telaQI, 0, 3.6, -6.5, nave);
em(box(7, 4.2, 0.3, 0x1b1b1b), 0, 0, 0, telaQI);
const telaQIc = document.createElement('canvas'); telaQIc.width = 700; telaQIc.height = 420;
{
  const g = telaQIc.getContext('2d'); g.fillStyle = '#0b132b'; g.fillRect(0, 0, 700, 420);
  g.lineWidth = 12;
  g.fillStyle = '#fee440'; g.beginPath(); g.moveTo(120, 300); g.lineTo(200, 130); g.lineTo(280, 300); g.closePath(); g.fill();
  g.fillStyle = '#00f5d4'; g.beginPath(); g.arc(350, 215, 85, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f15bb5'; g.fillRect(470, 135, 160, 160);
  g.fillStyle = '#fff'; g.font = '48px Anton'; g.textAlign = 'center'; g.fillText('TESTE DE QI', 350, 70);
}
const texQI = new THREE.CanvasTexture(telaQIc); texQI.colorSpace = THREE.SRGBColorSpace;
const planoQI = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.96), new THREE.MeshStandardMaterial({ map: texQI, emissive: 0xffffff, emissiveMap: texQI, emissiveIntensity: 0.9 }));
em(planoQI, 0, 0, 0.16, telaQI);
const telas = [];
for (const [x, z, ry] of [[-8, -4, 0.9], [8, -4, -0.9]]) {
  const t = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.2), new THREE.MeshStandardMaterial({ color: 0x00f5d4, emissive: 0x00f5d4, emissiveIntensity: 1 }));
  em(t, x, 3.5, z, nave); t.rotation.y = ry; telas.push(t);
}
const raioAzul = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, 8, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
em(raioAzul, 0, 6, 0, nave); raioAzul.visible = false;
const faiscas = new THREE.Group(); em(faiscas, 0, 2.6, 0, nave);
for (let i = 0; i < 24; i++) em(esfera(0.07, emissivo(0x9bf6ff, 4), 0), Math.cos(i) * 1.2, (i % 5) * 0.2, Math.sin(i) * 1.2, faiscas);
faiscas.visible = false;
const luzNave = new THREE.PointLight(0xc77dff, 60, 40, 1.2); em(luzNave, 0, 8, 0, nave);
const luzNave2 = new THREE.PointLight(0xfff0e0, 25, 30, 1.2); em(luzNave2, 0, 4, 6, nave);
const luzNave3 = new THREE.PointLight(0xfff0e0, 20, 20, 1.2); em(luzNave3, 0, 3, -5, nave);
const holofote = new THREE.SpotLight(0xffffff, 250, 20, 0.5, 0.5, 1.2); em(holofote, 0, 9.5, 0, nave); holofote.target.position.set(1000, 0, 0); scene.add(holofote.target);

// ------------------------------------------------------------------ ambientes
function ambiente(tipo) {
  const noite = tipo === 'noite';
  scene.background = CEU[tipo];
  estrelas.visible = noite;
  if (noite) {
    hemi.color.set(0xa9b8ff); hemi.groundColor.set(0x5a3d8a); hemi.intensity = 2.0;
    sol.color.set(0xb8c4ff); sol.intensity = 1.6;
    scene.fog = new THREE.Fog(0x3b2a8f, 90, 420);
  } else if (tipo === 'aurora') {
    hemi.color.set(0xffe0c0); hemi.groundColor.set(0x88aa66); hemi.intensity = 1.6;
    sol.color.set(0xffc58a); sol.intensity = 2.6;
    scene.fog = new THREE.Fog(0xffc8a8, 120, 500);
  } else if (tipo === 'nave') {
    hemi.color.set(0xd0a0ff); hemi.groundColor.set(0x2a0a55); hemi.intensity = 1.2;
    sol.intensity = 0; scene.fog = null;
  } else {
    hemi.color.set(0xffffff); hemi.groundColor.set(0x88bb66); hemi.intensity = 1.5;
    sol.color.set(0xfff4e0); sol.intensity = 2.8;
    scene.fog = new THREE.Fog(0xd8f2ff, 150, 600);
  }
  janelasNoite.forEach(j => j.material.emissiveIntensity = noite ? 1.4 : 0);
  lampadas.forEach(l => l.material.emissiveIntensity = noite ? 3 : 0);
  luzesPoste.forEach(l => l.intensity = noite ? 30 : 0);
  luzBar.intensity = noite ? 25 : 0;
}

// ------------------------------------------------------------------ câmera
function cam(u, de, para, alvoDe, alvoPara) {
  const e = suave(u);
  camera.position.set(lerp(de[0], para[0], e), lerp(de[1], para[1], e), lerp(de[2], para[2], e));
  const a = alvoPara || alvoDe;
  camera.lookAt(lerp(alvoDe[0], a[0], e), lerp(alvoDe[1], a[1], e), lerp(alvoDe[2], a[2], e));
}

// ------------------------------------------------------------------ cenas
function reset() {
  elenco.forEach(p => { p.boca.scale.y = 1; p.g.visible = false; p.g.rotation.set(0, 0, 0); p.g.scale.setScalar(1); pose(p); p.oculos.visible = false; p.oculosSol.visible = false; p.corrente.visible = false; });
  copoPinga.visible = false; copoSuco.visible = false; garrafaAlf.visible = false; prancheta.visible = false; biblia.visible = false;
  alfredo.nariz.material = mat(0xe63946);
  alfredo.corpo.material = mat(0xd62828);
  ufo.g.visible = false; ufo.raio.visible = false; ufo.luz.intensity = 0; ufo.g.scale.setScalar(1); ufo.g.rotation.set(0, 0, 0);
  turismo.visible = false; barracaC.visible = false;
  scanner.visible = false; raioAzul.visible = false; faiscas.visible = false;
  camera.fov = 50;
}
function mostrar(p, x, y, z, ry = 0) { p.g.visible = true; p.g.position.set(x, y, z); p.g.rotation.y = ry; return p; }
function alfredoSabio() { alfredo.oculos.visible = true; alfredo.nariz.material = mat(0xd9a066); }
function alfredoRico() {
  alfredoSabio(); alfredo.oculos.visible = false; alfredo.oculosSol.visible = true; alfredo.corrente.visible = true;
  alfredo.corpo.material = mat(0xf8f8f8);
}
function multidao(cx, cz, n, olharX, olharZ, t, raio = 5, animado = 0) {
  for (let i = 0; i < n; i++) {
    const p = povo[i]; const a = (i / n) * Math.PI * 0.9 + Math.PI * 0.05;
    const r = raio + (i % 3) * 1.3;
    const x = cx + Math.cos(a) * r * 1.4 - r * 0.0, z = cz - Math.sin(a) * r;
    mostrar(p, x, 0, z, Math.atan2(olharX - x, olharZ - z));
    pose(p, { fase: t * 3 + i, bracos: animado ? 0.2 + 0.2 * Math.sin(t * 6 + i) : 0, acenar: animado && i % 3 === 0 ? 1 : 0 });
  }
}

const CENAS = {
  cidade_aerea(u, t) {
    ambiente('noite'); sombraEm(0, 0, 45);
    ufo.g.visible = true; ufo.g.position.set(120, 40, -150); ufo.g.scale.setScalar(2);
    mostrar(alfredo, 6.5, 0, -4.2, 0); pose(alfredo, { fase: t * 2, bambo: 1 });
    cam(u, [55, 42, 60], [30, 22, 42], [0, 2, 0], [2, 4, -5]);
  },
  cidade_rua(u, t) {
    ambiente('noite'); sombraEm(0, 0, 40);
    ufo.g.visible = true; ufo.g.position.set(140, 55, -120); ufo.g.scale.setScalar(2.5);
    for (let i = 0; i < 4; i++) { const p = mostrar(povo[i], -12 + i * 6 + u * 4, 0, i % 2 ? 2 : -2, Math.PI / 2); pose(p, { andar: 0.6, fase: t * 6 + i }); }
    cam(u, [-26, 2.4, 2], [-8, 3.2, 1], [10, 3, 0], [30, 8, -5]);
  },
  bar(u, t, fala) {
    ambiente('noite'); sombraEm(7, -6, 20);
    mostrar(alfredo, 6.6, 0, -4.4, 1.1); pose(alfredo, { fase: t * 2, bambo: 1.2 });
    copoPinga.visible = true;
    alfredo.bracoD.rotation.x = fala === 'alfredo' ? -2.4 : -1.0;
    mostrar(ze, 8.3, 0, -6.2, -0.5); pose(ze, { fase: t }); ze.bracoE.rotation.x = -0.9;
    cam(u, [10.4, 2.4, -0.2], [9.8, 2.2, -0.9], [7.4, 1.6, -5.2]);
  },
  cleide(u, t, fala) {
    ambiente('dia'); sombraEm(-1000, 0, 15);
    mostrar(cleide, -1000.6, 0, 1.2, 0.1);
    pose(cleide, { fase: t * 2, bracos: fala === 'cleide' ? 0.5 + 0.3 * Math.sin(t * 5) : 0.15 });
    if (fala === 'cleide') { cleide.bracoD.rotation.x = -1.2 + Math.sin(t * 7) * 0.5; cleide.bracoE.rotation.z = -0.9; }
    roupas.forEach((r, i) => r.rotation.x = Math.sin(t * 2 + i) * 0.15);
    cam(u, [-1000.2, 1.9, 5.6], [-1000.4, 1.8, 4.4], [-1000.6, 1.65, 1.2]);
  },
  cleide_final(u, t, fala) {
    CENAS.cleide(u, t, fala); barracaC.visible = true;
    cam(u, [-998.2, 2.4, 8], [-999.6, 1.9, 5], [-999.6, 1.6, 1.2]);
  },
  estrada(u, t) {
    ambiente('noite'); sombraEm(40, 0, 20);
    const x = 33 + u * 12;
    mostrar(alfredo, x, 0, 0, Math.PI / 2); pose(alfredo, { andar: 0.5, fase: t * 5, bambo: 1.6 });
    alfredo.g.position.z = Math.sin(t * 1.7) * 0.8;
    garrafaAlf.visible = true;
    cam(u, [x - 2, 2.4, 6.5], [x + 1, 2.4, 6.5], [x + 1.5, 1.4, 0]);
  },
  luz_distante(u, t) {
    ambiente('noite'); sombraEm(50, 0, 20);
    mostrar(alfredo, 46, 0, 0, Math.PI / 2); pose(alfredo, { fase: t * 2, bambo: 1.2 }); garrafaAlf.visible = true;
    ufo.g.visible = true; ufo.g.position.set(112, 9 + Math.sin(t * 2) * 0.6, 0); ufo.luz.intensity = 40; ufo.g.scale.setScalar(1.3);
    cam(u, [41, 2.3, 2.6], [42, 2.3, 2.0], [60, 3, -0.5], [90, 7, -1]);
  },
  alfredo_close(u, t, fala) {
    ambiente('noite'); sombraEm(50, 0, 15);
    mostrar(alfredo, 46, 0, 0, Math.PI / 2); pose(alfredo, { fase: t * 2, bambo: 0.8 }); garrafaAlf.visible = true;
    alfredo.bracoE.rotation.x = -2.5; alfredo.bracoE.rotation.z = -0.4;
    ufo.g.visible = true; ufo.g.position.set(112, 9, 0); ufo.luz.intensity = 40;
    cam(u, [49.8, 2.1, 1.4], [49.2, 2.05, 0.9], [46, 1.95, 0]);
  },
  corrida(u, t) {
    ambiente('noite'); sombraEm(80, 0, 30);
    const x = 50 + u * 48;
    mostrar(alfredo, x, Math.abs(Math.sin(t * 14)) * 0.25, 0, Math.PI / 2); pose(alfredo, { andar: 1.1, fase: t * 14 });
    alfredo.g.rotation.x = 0; alfredo.cab.rotation.z = 0;
    ufo.g.visible = true; ufo.g.position.set(112, 9, 0); ufo.luz.intensity = 40;
    cam(u, [x - 5, 1.6, 5], [x - 4, 2.0, 4.5], [x + 2, 1.5, 0]);
  },
  abducao(u, t, fala) {
    ambiente('noite'); sombraEm(105, 0, 20);
    ufo.g.visible = true; ufo.g.position.set(105, 14, 0); ufo.raio.visible = true; ufo.luz.intensity = 80;
    ufo.raio.material.opacity = 0.25 + 0.1 * Math.sin(t * 10);
    const y = suave(u) * 9;
    mostrar(alfredo, 105, y, 0, t * 3); pose(alfredo, { fase: t * 10 });
    alfredo.bracoE.rotation.z = -2.4 + Math.sin(t * 12) * 0.5; alfredo.bracoD.rotation.z = 2.4 + Math.sin(t * 12 + 1) * 0.5;
    alfredo.pernaE.rotation.x = Math.sin(t * 9) * 0.8; alfredo.pernaD.rotation.x = -Math.sin(t * 9) * 0.8;
    cam(u, [94, 1.2, 9], [96, 2.5, 11], [105, 3, 0], [105, 9, 0]);
  },
  nave_sobe(u, t) {
    ambiente('noite'); sombraEm(105, 0, 20);
    ufo.g.visible = true; ufo.luz.intensity = 30;
    const e = suave(u);
    ufo.g.position.set(105 + e * 60, 14 + e * e * 120, -e * 80);
    cam(u, [92, 2, 14], [92, 3, 14], [105, 14, 0], [140, 60, -50]);
  },
  nave_interior(u, t) {
    ambiente('nave');
    mostrar(alfredo, 1000, 1.25, 0.4, 0); alfredo.g.rotation.x = -Math.PI / 2 * (1 - suave((u - 0.5) * 3));
    pose(alfredo, {}); alfredo.g.position.y = 1.25 + 0.0;
    aliens.forEach((a, i) => { mostrar(a, 997 + i * 3, 0, -3.5, 0); pose(a, { fase: t * 2 + i }); a.g.position.y = Math.sin(t * 2 + i) * 0.05; });
    cam(u, [1000, 7, 11], [1000, 4, 8], [1000, 1.5, 0]);
  },
  aliens(u, t, fala) {
    ambiente('nave');
    aliens.forEach((a, i) => { mostrar(a, 998.6 + i * 1.4, 0, -2, 0); pose(a, { fase: t * 2 + i }); a.cab.rotation.z = Math.sin(t * 1.5 + i) * 0.15; });
    if (fala === 'alien') aliens[1].bracoD.rotation.x = -1.4;
    cam(u, [1000, 1.9, 3.6], [1000, 2.2, 2.6], [1000, 1.9, -2]);
  },
  alfredo_mesa(u, t, fala) {
    ambiente('nave');
    mostrar(alfredo, 1000, 1.25, 0, 0); pose(alfredo, {});
    alfredo.pernaE.rotation.x = -1.5; alfredo.pernaD.rotation.x = -1.5; alfredo.g.position.set(1000, 0.45, 0);
    alfredo.bracoD.rotation.x = fala === 'alfredo' ? -1.2 + Math.sin(t * 6) * 0.3 : 0;
    aliens.forEach((a, i) => { mostrar(a, 998.5 + i * 1.5, 0, -2.4, 0); pose(a, { fase: t + i }); });
    cam(u, [1000.3, 2.1, 3.2], [1000.1, 2.0, 2.6], [1000, 1.85, 0]);
  },
  teste_ciencia(u, t) {
    ambiente('nave');
    mostrar(alfredo, 1000, 1.25, 0.9, 0); alfredo.g.rotation.x = -Math.PI / 2; pose(alfredo, {});
    scanner.visible = true; scanner.position.set(1000, 1.45, 1.4 - ((t * 0.8) % 1) * 3.2);
    telas.forEach((s, i) => s.material.emissiveIntensity = 0.6 + 0.8 * (0.5 + 0.5 * Math.sin(t * 9 + i * 2)));
    aliens.forEach((a, i) => { mostrar(a, 998 + i * 2, 0, -2.6, 0); pose(a, { fase: t + i }); a.bracoD.rotation.x = -1 - Math.sin(t * 4 + i) * 0.3; });
    cam(u, [1004.5, 3.4, 3.5], [1003.5, 3, 2.6], [1000, 1.3, 0]);
  },
  teste_qi(u, t, fala) {
    ambiente('nave');
    mostrar(alfredo, 1000, 0.45, -2.5, Math.PI); pose(alfredo, {});
    alfredo.pernaE.rotation.x = -1.5; alfredo.pernaD.rotation.x = -1.5;
    if (fala === 'alfredo') { alfredo.bracoD.rotation.x = -2.6; alfredo.g.rotation.y = Math.PI * 0.85; }
    mostrar(aliens[0], 1003, 0, -5, -0.6); pose(aliens[0], {}); aliens[0].bracoD.rotation.x = -1.8;
    if (u < 0.5 || fala !== 'alfredo') cam(u, [1000.8, 2.4, 1.5], [1000.4, 2.6, 0.5], [1000, 3.4, -6.5]);
    else cam(u, [1000.6, 1.9, -5.3], [1000.4, 1.9, -5.0], [1000, 1.7, -2.5]);
  },
  teste_dor(u, t, fala) {
    ambiente('nave');
    mostrar(alfredo, 1000, 0.45, 0, 0); pose(alfredo, {});
    alfredo.pernaE.rotation.x = -1.5; alfredo.pernaD.rotation.x = -1.5;
    const al = mostrar(aliens[2], 1001.2 + suave(u * 1.5) * 1.6, 0, 0.6, -1.2); pose(al, { andar: 0.3, fase: t * 6 });
    copoPinga.visible = false;
    const c = copo(0xfff3c4); // copo com o alien
    if (!al.mao.children.length) al.mao.add(c);
    alfredo.bracoD.rotation.x = -1.4; alfredo.bracoD.rotation.z = 0.9 + Math.sin(t * 9) * 0.2;
    if (fala === 'alfredo') { alfredo.bracoE.rotation.x = -1.8; alfredo.bracoE.rotation.z = -0.6 + Math.sin(t * 12) * 0.3; alfredo.g.rotation.z = Math.sin(t * 10) * 0.08; }
    cam(u, [1001, 2.3, 5.6], [1001.2, 2.2, 5.0], [1001.2, 1.5, 0.2]);
  },
  transformacao(u, t) {
    ambiente('nave');
    mostrar(alfredo, 1000, 0.45, 0, 0); pose(alfredo, {}); alfredo.pernaE.rotation.x = -1.5; alfredo.pernaD.rotation.x = -1.5;
    raioAzul.visible = true; raioAzul.material.opacity = 0.16 + 0.08 * Math.sin(t * 20);
    faiscas.visible = true; faiscas.rotation.y = t * 4; faiscas.position.y = 2.2 + Math.sin(t * 3) * 0.3;
    alfredo.cab.rotation.y = Math.sin(t * 25) * 0.15;
    if (u > 0.6) alfredoSabio();
    const a = -0.6 + u * 1.2;
    camera.position.set(1000 + Math.sin(a) * 3.6, 2.3, Math.cos(a) * 3.6); camera.lookAt(1000, 1.9, 0);
  },
  devolucao(u, t) {
    ambiente('aurora'); sombraEm(105, 0, 25);
    ufo.g.visible = true; ufo.luz.intensity = 20;
    const e = suave(u * 1.6);
    ufo.g.position.set(105 + suave((u - 0.6) * 2.5) * 80, 12 + suave((u - 0.6) * 2.5) * 70, 0);
    ufo.raio.visible = u < 0.6;
    alfredoSabio();
    mostrar(alfredo, 105, 6 * (1 - e), 0, 0.3); pose(alfredo, { fase: t });
    cam(u, [97, 2.2, 13], [98, 3.2, 12], [105, 4, 0], [108, 6, 0]);
  },
  alfredo_esperto(u, t, fala) {
    ambiente('aurora'); sombraEm(105, 0, 15);
    alfredoSabio();
    mostrar(alfredo, 105, 0, 0, 0.4); pose(alfredo, { fase: t });
    alfredo.bracoE.rotation.x = -1.3; alfredo.bracoE.rotation.z = 0.5;
    alfredo.bracoD.rotation.x = -1.0 - 0.4 * Math.sin(t * 2); alfredo.cab.rotation.z = 0.12;
    cam(u, [106.4, 2.0, 3.4], [106.0, 1.95, 2.7], [105.2, 1.85, 0]);
  },
  bar_dia(u, t) {
    ambiente('dia'); sombraEm(7, -6, 20);
    alfredoSabio();
    mostrar(alfredo, 6.6, 0, -4.4, 1.1); pose(alfredo, {}); copoSuco.visible = true; alfredo.bracoD.rotation.x = -1.2 - suave(u * 2) * 1.0;
    mostrar(ze, 8.3, 0, -6.2, -0.5); pose(ze, {}); ze.boca.scale.y = 1 + suave(u * 2) * 6; ze.bracoE.rotation.z = -2.6; ze.bracoD.rotation.z = 2.6;
    cam(u, [10.4, 2.4, -0.2], [9.6, 2.2, -1.2], [7.4, 1.6, -5.2]);
  },
  cidade_choque(u, t) {
    ambiente('dia'); sombraEm(0, 10, 25);
    alfredoSabio(); mostrar(alfredo, 0, 0, 10, 0); pose(alfredo, {}); copoSuco.visible = true; alfredo.bracoD.rotation.x = -1.0;
    multidao(0, 18.5, 12, 0, 10, t, 4, 0);
    povo.forEach(p => { p.boca.scale.y = 5; });
    cam(u, [6, 2.1, 6.5], [4.5, 2.3, 7.5], [0, 1.7, 13]);
  },
  alfredo_praca(u, t, fala) {
    ambiente('dia'); sombraEm(0, 12, 25);
    alfredoSabio(); mostrar(alfredo, 0, 0.6, 12, Math.PI); pose(alfredo, { fase: t, bracos: 0.3 + 0.2 * Math.sin(t * 3) });
    alfredo.bracoD.rotation.x = -1.6 + Math.sin(t * 4) * 0.4;
    em(caixote, 0, 0.3, 12, scene); caixote.visible = true;
    multidao(0, 12, 12, 0, 12, t, 4, 0);
    cam(u, [2.5, 3.8, 1.5], [1.2, 3.5, 3.5], [0, 2.4, 12]);
  },
  religiosos(u, t, fala) {
    ambiente('dia'); sombraEm(-1, 22, 15);
    const trio = [padre, pastor, maeSanto];
    trio.forEach((p, i) => { mostrar(p, -2.2 + i * 2.2, 0, 16.5, Math.PI); pose(p, { fase: t + i }); p.bracoE.rotation.x = -1.3; p.bracoD.rotation.x = -1.3; p.bracoE.rotation.z = 0.5; p.bracoD.rotation.z = -0.5; });
    biblia.visible = true;
    if (fala === 'coro' && FALANDO) trio.forEach(p => falar(p, true, t + p.g.position.x));
    cam(u, [0, 2.0, 3.5], [0, 1.9, 5.5], [0, 1.6, 16.5]);
  },
  turismo(u, t) {
    ambiente('dia'); sombraEm(0, 5, 45);
    turismo.visible = true; discosTelhado.forEach((d, i) => { animarDisco(d, t + i); d.g.position.y = 7.4 + Math.sin(t * 2 + i) * 0.3; });
    onibus.position.x = 60 - suave(u * 1.4) * 30;
    for (let i = 0; i < 10; i++) {
      const p = mostrar(povo[i], -10 + i * 2.2, 0, 4 + (i % 2) * 1.5, Math.PI + (i % 3 - 1) * 0.4);
      pose(p, { fase: t * 3 + i, acenar: i % 3 === 0 ? 1 : 0 });
      if (i % 3 === 1) { p.bracoD.rotation.x = -1.6; p.bracoE.rotation.x = -1.6; }
    }
    etGigante.bracoD.rotation.z = 2.6 + Math.sin(t * 2) * 0.2;
    cam(u, [-64, 4.5, 0], [-52, 4, 0], [0, 6, 0], [0, 4, 3]);
  },
  alfredo_rico(u, t, fala) {
    ambiente('dia'); sombraEm(0, 18, 20);
    turismo.visible = true;
    alfredoRico();
    mostrar(alfredo, 2.2, 0.8, 17.3, Math.PI); pose(alfredo, { fase: t, acenar: fala === 'alfredo2' ? 0 : 1 });
    if (fala === 'alfredo2') { alfredo.bracoD.rotation.x = -1.5; alfredo.bracoD.rotation.z = -0.8 + Math.sin(t * 4) * 0.2; }
    mostrar(prefeito, 4.3, 0.8, 17.5, Math.PI - 0.5); pose(prefeito, {}); prefeito.g.scale.setScalar(0.9);
    prancheta.visible = true; prefeito.bracoD.rotation.x = -1.4; prefeito.cab.rotation.x = 0.3;
    multidao(3, 16, 10, 3, 17.3, t, 3.5, 1);
    cam(u, [0.5, 4.5, 3], [1.5, 3.6, 5.5], [3, 2.2, 17]);
  },
  fim(u, t) {
    ambiente('dia'); sombraEm(0, 5, 45);
    turismo.visible = true; discosTelhado.forEach((d, i) => animarDisco(d, t + i));
    ufo.g.visible = true; ufo.g.position.set(-60 + u * 140, 22 + Math.sin(t * 2) * 2, -20); ufo.g.rotation.z = Math.sin(t * 3) * 0.15;
    for (let i = 0; i < 8; i++) { const p = mostrar(povo[i], -8 + i * 2.3, 0, 6, Math.PI); pose(p, { fase: t * 4 + i, acenar: 1 }); }
    cam(u, [0, 4, -2], [0, 24, -34], [0, 4, 10], [0, 8, 0]);
  },
};
const caixote = box(1.4, 0.6, 1.4, 0xa0703a); caixote.visible = false;

// ------------------------------------------------------------------ linha do tempo
let TL = null;
let FALANDO = false;
window.preparar = async (timeline) => {
  TL = timeline;
  await document.fonts.load('40px Anton');
  return true;
};
window.renderAt = (t) => {
  reset(); caixote.visible = false;
  const seg = TL.segmentos.find(s => t >= s.inicio && t < s.fim) || TL.segmentos[TL.segmentos.length - 1];
  const u = clamp((t - seg.inicio) / (seg.fim - seg.inicio));
  const fala = TL.falas.find(f => t >= f.inicio && t < f.fim);
  const falando = fala && fala.palavras.some(p => t >= fala.inicio + p.t && t < fala.inicio + p.t + p.d + 0.05);
  const voz = fala ? fala.voz : null;
  FALANDO = !!falando;
  animarDisco(ufo, t);
  (CENAS[seg.cena] || CENAS.cidade_aerea)(u, t, voz);
  camera.updateProjectionMatrix();
  if (FALANDO && voz && mapaVoz[voz] && mapaVoz[voz].g.visible) falar(mapaVoz[voz], true, t);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/jpeg', 0.93);
};
window.pronto = true;
