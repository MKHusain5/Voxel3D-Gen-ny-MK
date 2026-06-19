import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { PLYExporter } from 'three/addons/exporters/PLYExporter.js';

const canvas = document.querySelector('#viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x070a14, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070a14, 13, 30);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(6.5, 5.2, 8.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1, 0);

const hemi = new THREE.HemisphereLight(0xdff7ff, 0x171324, 2.2);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(5, 7, 5);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x8b5cf6, 26, 18);
rimLight.position.set(-5, 3, -4);
scene.add(rimLight);

const grid = new THREE.GridHelper(14, 28, 0x2ad7ff, 0x26304f);
grid.position.y = -0.02;
scene.add(grid);

const modelGroup = new THREE.Group();
modelGroup.name = 'Voxel3D_Generated_Model';
scene.add(modelGroup);

const boneGroup = new THREE.Group();
boneGroup.name = 'Auto_Bone_Guide';
scene.add(boneGroup);

let sourceImage = null;
let voxelData = [];
let animating = true;
let animationMode = 'idle';
let animationSpeed = 1;
let baseRotationY = 0;
let clock = new THREE.Clock();
let bonesVisible = true;

const els = {
  imageInput: document.querySelector('#imageInput'),
  sourcePreview: document.querySelector('#sourcePreview'),
  dropCopy: document.querySelector('#dropCopy'),
  sampleBtn: document.querySelector('#sampleBtn'),
  generateBtn: document.querySelector('#generateBtn'),
  resolutionRange: document.querySelector('#resolutionRange'),
  resolutionValue: document.querySelector('#resolutionValue'),
  voxelSizeRange: document.querySelector('#voxelSizeRange'),
  voxelSizeValue: document.querySelector('#voxelSizeRange'), // Fallback fix
  depthRange: document.querySelector('#depthRange'),
  depthValue: document.querySelector('#depthValue'),
  alphaRange: document.querySelector('#alphaRange'),
  alphaValue: document.querySelector('#alphaValue'),
  paletteSelect: document.querySelector('#paletteSelect'),
  moveX: document.querySelector('#moveX'),
  moveY: document.querySelector('#moveY'),
  moveZ: document.querySelector('#moveZ'),
  moveXValue: document.querySelector('#moveXValue'),
  moveYValue: document.querySelector('#moveYValue'),
  moveZValue: document.querySelector('#moveZValue'),
  resetMoveBtn: document.querySelector('#resetMoveBtn'),
  fitViewBtn: document.querySelector('#fitViewBtn'),
  rigPreset: document.querySelector('#rigPreset'),
  autoBoneBtn: document.querySelector('#autoBoneBtn'),
  toggleBonesBtn: document.querySelector('#toggleBonesBtn'),
  animationSelect: document.querySelector('#animationSelect'),
  speedRange: document.querySelector('#speedRange'),
  speedValue: document.querySelector('#speedValue'),
  playBtn: document.querySelector('#playBtn'),
  pauseBtn: document.querySelector('#pauseBtn'),
  exportGlbBtn: document.querySelector('#exportGlbBtn'),
  exportGltfBtn: document.querySelector('#exportGltfBtn'),
  exportObjBtn: document.querySelector('#exportObjBtn'),
  exportPlyBtn: document.querySelector('#exportPlyBtn'),
  exportJsonBtn: document.querySelector('#exportJsonBtn'),
  voxelCount: document.querySelector('#voxelCount'),
  boneCount: document.querySelector('#boneCount'),
  meshCount: document.querySelector('#meshCount'),
  fileSize: document.querySelector('#fileSize'),
  log: document.querySelector('#log'),
  resetCameraBtn: document.querySelector('#resetCameraBtn'),
  centerModelBtn: document.querySelector('#centerModelBtn'),
  fullscreenBtn: document.querySelector('#fullscreenBtn')
};

// Double-check element bindings to handle label mismatches in original layout mapping
if(document.querySelector('#voxelSizeValue')) els.voxelSizeValue = document.querySelector('#voxelSizeValue');

function log(message) {
  const stamp = new Date().toLocaleTimeString();
  els.log.textContent = `[${stamp}] ${message}\n` + els.log.textContent.split('\n').slice(0, 8).join('\n');
}

function updateRangeLabels() {
  if(els.resolutionValue) els.resolutionValue.textContent = els.resolutionRange.value;
  if(els.voxelSizeValue) els.voxelSizeValue.textContent = Number(els.voxelSizeRange.value).toFixed(2);
  if(els.depthValue) els.depthValue.textContent = els.depthRange.value;
  if(els.alphaValue) els.alphaValue.textContent = els.alphaRange.value;
  if(els.speedValue) els.speedValue.textContent = Number(els.speedRange.value).toFixed(1);
  if(els.moveXValue) els.moveXValue.textContent = Number(els.moveX.value).toFixed(1);
  if(els.moveYValue) els.moveYValue.textContent = Number(els.moveY.value).toFixed(1);
  if(els.moveZValue) els.moveZValue.textContent = Number(els.moveZ.value).toFixed(1);
}

function disposeGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse?.((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

function setSourceImage(img, src) {
  sourceImage = img;
  els.sourcePreview.src = src;
  els.sourcePreview.style.display = 'block';
  els.dropCopy.style.display = 'none';
  log('Image loaded. Adjust voxel settings, then generate the Voxel3D model.');
}

function loadImageFromFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => setSourceImage(img, url);
  img.onerror = () => log('Could not read that image. Try another PNG, JPG, WEBP, or GIF.');
  img.src = url;
}

function createSampleImage() {
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 30;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.clearRect(0, 0, c.width, c.height);
  const draw = (color, px, py, w, h) => {
    x.fillStyle = color;
    x.fillRect(px, py, w, h);
  };
  draw('#63e6ff', 8, 2, 8, 3);
  draw('#a78bfa', 6, 5, 12, 9);
  draw('#f8fafc', 9, 8, 2, 2);
  draw('#f8fafc', 14, 8, 2, 2);
  draw('#111827', 10, 13, 4, 1);
  draw('#54f2a5', 7, 15, 10, 7);
  draw('#54f2a5', 4, 17, 3, 7);
  draw('#54f2a5', 17, 17, 3, 7);
  draw('#ffd166', 8, 22, 4, 6);
  draw('#ffd166', 13, 22, 4, 6);
  draw('#ff6b8b', 6, 28, 6, 2);
  draw('#ff6b8b', 13, 28, 6, 2);
  const src = c.toDataURL('image/png');
  const img = new Image();
  img.onload = () => {
    setSourceImage(img, src);
    generateVoxelModel();
    createAutoBones();
  };
  img.src = src;
}

function colorForMode(r, g, b, a, x, y) {
  const mode = els.paletteSelect.value;
  if (mode === 'source') return new THREE.Color(r / 255, g / 255, b / 255);
  if (mode === 'clay') return new THREE.Color(0.78, 0.64, 0.52);
  if (mode === 'crystal') return new THREE.Color(0.35 + r / 700, 0.75 + g / 1200, 1.0);
  const hue = ((x * 18 + y * 9 + r + b) % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.9, 0.62);
}

// OPTIMIZED: Uses InstancedMesh structure grouping by identical style requirements
function generateVoxelModel() {
  if (!sourceImage) {
    log('Please upload an image or load the sample first.');
    return;
  }

  disposeGroup(modelGroup);
  voxelData = [];
  
  const targetWidth = Number(els.resolutionRange.value);
  const scale = targetWidth / sourceImage.width;
  const targetHeight = Math.max(1, Math.round(sourceImage.height * scale));
  const voxelSize = Number(els.voxelSizeRange.value);
  const depth = Number(els.depthRange.value);
  const alphaCutoff = Number(els.alphaRange.value);

  const c = document.createElement('canvas');
  c.width = targetWidth;
  c.height = targetHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);
  const pixels = ctx.getImageData(0, 0, targetWidth, targetHeight).data;

  const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
  const centerX = (targetWidth - 1) / 2;
  const centerY = (targetHeight - 1) / 2;
  const centerZ = (depth - 1) / 2;
  
  // Sort setups into color-grouped lists to feed directly into single InstancedMesh objects
  const instanceDataMap = new Map();
  let totalVoxelsCount = 0;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const i = (y * targetWidth + x) * 4;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
      if (a <= alphaCutoff) continue;
      
      for (let z = 0; z < depth; z++) {
        const color = colorForMode(r, g, b, a, x, y);
        const key = color.getHexString();
        
        if (!instanceDataMap.has(key)) {
          instanceDataMap.set(key, { color: color.clone(), transforms: [] });
        }
        
        const posX = (x - centerX) * voxelSize;
        const posY = (targetHeight - y) * voxelSize;
        const posZ = (z - centerZ) * voxelSize;
        
        instanceDataMap.get(key).transforms.push(new THREE.Vector3(posX, posY, posZ));
        voxelData.push({ x, y, z, r, g, b, a, position: [posX, posY, posZ], size: voxelSize });
        totalVoxelsCount++;
      }
    }
  }

  // Instantiate one single mesh layer per unique color key
  instanceDataMap.forEach((groupData, key) => {
    const mat = new THREE.MeshStandardMaterial({
      color: groupData.color,
      roughness: 0.52,
      metalness: els.paletteSelect.value === 'crystal' ? 0.16 : 0.02,
      transparent: els.paletteSelect.value === 'crystal',
      opacity: els.paletteSelect.value === 'crystal' ? 0.86 : 1
    });

    const instMesh = new THREE.InstancedMesh(geometry, mat, groupData.transforms.length);
    instMesh.name = `voxels_group_${key}`;
    
    const dummy = new THREE.Object3D();
    groupData.transforms.forEach((pos, idx) => {
      dummy.position.copy(pos);
      dummy.updateMatrix();
      instMesh.setMatrixAt(idx, dummy.matrix);
    });
    
    instMesh.instanceMatrix.needsUpdate = true;
    modelGroup.add(instMesh);
  });

  const bevel = new THREE.Box3().setFromObject(modelGroup);
  modelGroup.position.y = Math.max(0, -bevel.min.y + 0.02);
  modelGroup.rotation.y = baseRotationY;
  
  applyMove();
  updateStats();
  fitCameraToObject(modelGroup);
  log(`Generated ${totalVoxelsCount.toLocaleString()} voxels consolidated efficiently across specialized color partitions.`);
}

function boneLine(name, from, to, color = 0xfff1a8) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 3 });
  const line = new THREE.Line(geo, mat);
  line.name = name;
  boneGroup.add(line);

  const jointMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 });
  [from, to].forEach((p, index) => {
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), jointMat);
    joint.position.copy(p);
    joint.name = `${name}_joint_${index}`;
    boneGroup.add(joint);
  });
}

function createAutoBones() {
  disposeGroup(boneGroup);
  const box = new THREE.Box3().setFromObject(modelGroup);
  if (!Number.isFinite(box.min.x)) {
    log('Generate a voxel model before adding bones.');
    return;
  }
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const preset = els.rigPreset.value;
  const top = box.max.y;
  const bottom = box.min.y;
  const mid = center.y;
  const shoulder = bottom + size.y * 0.68;
  const hip = bottom + size.y * 0.34;
  const head = bottom + size.y * 0.88;

  if (preset === 'prop') {
    boneLine('root_to_top', new THREE.Vector3(center.x, bottom, center.z), new THREE.Vector3(center.x, top, center.z), 0x6ee7ff);
    boneLine('width_axis', new THREE.Vector3(box.min.x, mid, center.z), new THREE.Vector3(box.max.x, mid, center.z), 0xa78bfa);
    boneLine('depth_axis', new THREE.Vector3(center.x, mid, box.min.z), new THREE.Vector3(center.x, mid, box.max.z), 0x54f2a5);
  } else if (preset === 'creature') {
    boneLine('spine', new THREE.Vector3(center.x, bottom, center.z), new THREE.Vector3(center.x, top, center.z), 0xffd166);
    boneLine('front_left_leg', new THREE.Vector3(center.x - size.x * 0.28, hip, center.z + size.z * 0.35), new THREE.Vector3(center.x - size.x * 0.34, bottom, center.z + size.z * 0.42), 0x54f2a5);
    boneLine('front_right_leg', new THREE.Vector3(center.x + size.x * 0.28, hip, center.z + size.z * 0.35), new THREE.Vector3(center.x + size.x * 0.34, bottom, center.z + size.z * 0.42), 0x54f2a5);
    boneLine('back_left_leg', new THREE.Vector3(center.x - size.x * 0.28, hip, center.z - size.z * 0.35), new THREE.Vector3(center.x - size.x * 0.34, bottom, center.z - size.z * 0.42), 0x54f2a5);
    boneLine('back_right_leg', new THREE.Vector3(center.x + size.x * 0.28, hip, center.z - size.z * 0.35), new THREE.Vector3(center.x + size.x * 0.34, bottom, center.z - size.z * 0.42), 0x54f2a5);
  } else {
    boneLine('spine', new THREE.Vector3(center.x, bottom, center.z), new THREE.Vector3(center.x, head, center.z), 0xffd166);
    boneLine('shoulders', new THREE.Vector3(box.min.x, shoulder, center.z), new THREE.Vector3(box.max.x, shoulder, center.z), 0x6ee7ff);
    boneLine('left_arm', new THREE.Vector3(center.x - size.x * 0.2, shoulder, center.z), new THREE.Vector3(box.min.x, hip, center.z), 0xa78bfa);
    boneLine('right_arm', new THREE.Vector3(center.x + size.x * 0.2, shoulder, center.z), new THREE.Vector3(box.max.x, hip, center.z), 0xa78bfa);
    boneLine('left_leg', new THREE.Vector3(center.x - size.x * 0.12, hip, center.z), new THREE.Vector3(center.x - size.x * 0.24, bottom, center.z), 0x54f2a5);
    boneLine('right_leg', new THREE.Vector3(center.x + size.x * 0.12, hip, center.z), new THREE.Vector3(center.x + size.x * 0.24, bottom, center.z), 0x54f2a5);
    boneLine('neck_head', new THREE.Vector3(center.x, shoulder, center.z), new THREE.Vector3(center.x, top, center.z), 0xff6b8b);
  }

  boneGroup.visible = bonesVisible;
  updateStats();
  log(`Auto bone guide created using the ${preset} preset.`);
}

function applyMove() {
  modelGroup.position.x = Number(els.moveX.value);
  modelGroup.position.z = Number(els.moveZ.value);
  const bbox = new THREE.Box3().setFromObject(modelGroup);
  const minY = Number.isFinite(bbox.min.y) ? bbox.min.y : 0;
  modelGroup.position.y += Number(els.moveY.value) - minY + 0.02;
  boneGroup.position.set(Number(els.moveX.value), Number(els.moveY.value), Number(els.moveZ.value));
  updateRangeLabels();
}

function resetMove() {
  els.moveX.value = 0;
  els.moveY.value = 0;
  els.moveZ.value = 0;
  modelGroup.position.set(0, modelGroup.position.y, 0);
  applyMove();
  log('Model movement reset.');
}

function updateStats() {
  els.voxelCount.textContent = voxelData.length.toLocaleString();
  els.boneCount.textContent = boneGroup.children.length.toLocaleString();
  let meshCount = 0;
  scene.traverse((obj) => { if (obj.isMesh || obj.isInstancedMesh) meshCount++; });
  els.meshCount.textContent = meshCount.toLocaleString();
}

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x)) return;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const distance = maxDim * 1.65;
  camera.position.set(center.x + distance, center.y + distance * 0.75, center.z + distance);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function resetCamera() {
  camera.position.set(6.5, 5.2, 8.4);
  controls.target.set(0, 1, 0);
  controls.update();
  log('Camera reset.');
}

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(420, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime() * animationSpeed;
  if (animating) {
    if (animationMode === 'idle') {
      modelGroup.rotation.y = baseRotationY + Math.sin(t * 0.8) * 0.06;
      modelGroup.scale.setScalar(1 + Math.sin(t * 1.5) * 0.018);
      boneGroup.rotation.y = modelGroup.rotation.y;
    } else if (animationMode === 'spin') {
      modelGroup.rotation.y += 0.018 * animationSpeed;
      boneGroup.rotation.y = modelGroup.rotation.y;
    } else if (animationMode === 'bounce') {
      modelGroup.position.y += Math.sin(t * 5) * 0.0025;
      boneGroup.position.y = modelGroup.position.y;
    } else if (animationMode === 'wave') {
      boneGroup.children.forEach((child, idx) => {
        child.rotation.z = Math.sin(t * 2.2 + idx * 0.42) * 0.12;
      });
      modelGroup.rotation.y = baseRotationY + Math.sin(t) * 0.08;
    } else {
      modelGroup.scale.setScalar(1);
    }
  }
  controls.update();
  renderer.render(scene, camera);
}

function bytesToSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  els.fileSize.textContent = bytesToSize(blob.size);
  log(`Downloaded ${filename} (${bytesToSize(blob.size)}).`);
}

function exportScene(binary = true) {
  if (!modelGroup.children.length) {
    log('Generate a voxel model before exporting.');
    return;
  }
  const exporter = new GLTFExporter();
  const exportRoot = new THREE.Group();
  exportRoot.name = 'Voxel3D_Export';
  exportRoot.add(modelGroup.clone(true));
  if (boneGroup.visible && boneGroup.children.length) exportRoot.add(boneGroup.clone(true));
  exporter.parse(exportRoot, (result) => {
    if (binary) {
      downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), 'voxel3d-model.glb');
    } else {
      const text = JSON.stringify(result, null, 2);
      downloadBlob(new Blob([text], { type: 'model/gltf+json' }), 'voxel3d-model.gltf');
    }
  }, (error) => log(`GLTF export error: ${error.message || error}`), { binary });
}

function exportObj() {
  if (!modelGroup.children.length) {
    log('Generate a voxel model before exporting.');
    return;
  }
  const exporter = new OBJExporter();
  const exportRoot = new THREE.Group();
  exportRoot.add(modelGroup.clone(true));
  if (boneGroup.visible && boneGroup.children.length) exportRoot.add(boneGroup.clone(true));
  const obj = exporter.parse(exportRoot);
  downloadBlob(new Blob([obj], { type: 'text/plain' }), 'voxel3d-model.obj');
}

function exportPly() {
  if (!modelGroup.children.length) {
    log('Generate a voxel model before exporting.');
    return;
  }
  const exporter = new PLYExporter();
  const exportRoot = new THREE.Group();
  exportRoot.add(modelGroup.clone(true));
  exporter.parse(exportRoot, (result) => {
    downloadBlob(new Blob([result], { type: 'application/octet-stream' }), 'voxel3d-model.ply');
  }, { binary: false });
}

function exportJson() {
  if (!voxelData.length) {
    log('Generate a voxel model before exporting voxel JSON.');
    return;
  }
  const payload = {
    type: 'Voxel3D',
    version: 1,
    created: new Date().toISOString(),
    settings: {
      resolution: Number(els.resolutionRange.value),
      voxelSize: Number(els.voxelSizeRange.value),
      depth: Number(els.depthRange.value),
      alphaCutoff: Number(els.alphaRange.value),
      palette: els.paletteSelect.value,
      rigPreset: els.rigPreset.value
    },
    transform: {
      position: modelGroup.position.toArray(),
      rotation: modelGroup.rotation.toArray(),
      scale: modelGroup.scale.toArray()
    },
    voxels: voxelData
  };
  const text = JSON.stringify(payload, null, 2);
  downloadBlob(new Blob([text], { type: 'application/json' }), 'voxel3d-model.json');
}

function bindEvents() {
  ['input', 'change'].forEach((eventName) => {
    [els.resolutionRange, els.voxelSizeRange, els.depthRange, els.alphaRange, els.speedRange, els.moveX, els.moveY, els.moveZ].forEach((el) => {
      if(el) {
        el.addEventListener(eventName, () => {
          animationSpeed = Number(els.speedRange.value);
          updateRangeLabels();
        });
      }
    });
  });

  [els.moveX, els.moveY, els.moveZ].forEach((el) => {
    if(el) el.addEventListener('input', applyMove);
  });
  
  els.imageInput.addEventListener('change', (e) => loadImageFromFile(e.target.files[0]));
  els.sampleBtn.addEventListener('click', createSampleImage);
  els.generateBtn.addEventListener('click', generateVoxelModel);
  els.autoBoneBtn.addEventListener('click', createAutoBones);
  els.toggleBonesBtn.addEventListener('click', () => {
    bonesVisible = !bonesVisible;
    boneGroup.visible = bonesVisible;
    log(`Bones ${bonesVisible ? 'shown' : 'hidden'}.`);
  });
  els.animationSelect.addEventListener('change', () => {
    animationMode = els.animationSelect.value;
    modelGroup.scale.setScalar(1);
    log(`Animation changed to ${animationMode}.`);
  });
  els.playBtn.addEventListener('click', () => { animating = true; log('Animation playback started.'); });
  els.pauseBtn.addEventListener('click', () => { animating = false; log('Animation playback paused.'); });
  els.resetMoveBtn.addEventListener('click', resetMove);
  els.fitViewBtn.addEventListener('click', () => fitCameraToObject(modelGroup.children.length ? modelGroup : grid));
  els.resetCameraBtn.addEventListener('click', resetCamera);
  els.centerModelBtn.addEventListener('click', () => fitCameraToObject(modelGroup.children.length ? modelGroup : grid));
  els.fullscreenBtn.addEventListener('click', () => canvas.parentElement.requestFullscreen?.());
  els.exportGlbBtn.addEventListener('click', () => exportScene(true));
  els.exportGltfBtn.addEventListener('click', () => exportScene(false));
  els.exportObjBtn.addEventListener('click', exportObj);
  els.exportPlyBtn.addEventListener('click', exportPly);
  els.exportJsonBtn.addEventListener('click', exportJson);
  window.addEventListener('resize', resize);
}

function addStarterVoid() {
  const torus = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.92, 0.26, 96, 14),
    new THREE.MeshStandardMaterial({ color: 0x13182a, metalness: 0.12, roughness: 0.28, emissive: 0x241047, emissiveIntensity: 0.6 })
  );
  torus.name = 'Corner_3D_Void_Placeholder';
  torus.position.set(0, 1.35, 0);
  modelGroup.add(torus);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 42, 26),
    new THREE.MeshBasicMaterial({ color: 0x02030a })
  );
  core.name = 'Dark_Void_Core';
  core.position.copy(torus.position);
  modelGroup.add(core);
  updateStats();
}

updateRangeLabels();
bindEvents();
resize();
addStarterVoid();
animate();
log('Loaded. A 3D void placeholder is visible in the corner preview. Upload an image to replace it with voxels.');
