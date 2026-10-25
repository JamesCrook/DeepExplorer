export { THREE, loadThree, make3DPane };

/* ─────────────────────────────────────────────────────────────────────────────
three-boot — the one place that knows Three.js exists.

THREE is a live binding: undefined until loadThree() resolves, and shared by
every 3D node thereafter.  Nodes import the binding, not a snapshot, so a
nugget may be read (and typed against) without Three.js being present at all.
A build with no 3D model drops this nugget and never touches the importmap.
──────────────────────────────────────────────────────────────────────────── */

let THREE, OrbitControls;
async function loadThree() {
  if (THREE) return;
  try {
    THREE = await import('three');
    OrbitControls = (await import('three/addons/controls/OrbitControls.js')).OrbitControls;
  } catch(e) { console.warn('Three.js failed to load.'); }
}

function make3DPane(container) {
  if (!THREE) return null;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const view = { scene, camera, renderer, controls, container };

  view.ro = new ResizeObserver(() => {
    if (view.container.clientWidth > 0 && view.container.clientHeight > 0) {
      view.camera.aspect = view.container.clientWidth / view.container.clientHeight;
      view.camera.updateProjectionMatrix();
      view.renderer.setSize(view.container.clientWidth, view.container.clientHeight);
    }
  });
  view.ro.observe(container);

  return view;
}
