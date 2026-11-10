import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Bloom wants linear HDR input, so the scene renders through the composer and OutputPass applies
// the renderer's ACES curve + sRGB transfer at the end.
export function createPostFX(renderer, stage, options = {}) {
  let composer = null;
  let bloom = null;
  let enabled = options.enabled !== false;
  const strength = options.bloom ?? 0.42;

  try {
    const size = drawSize(renderer);
    composer = new EffectComposer(renderer, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    });
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.width, size.height);

    composer.addPass(new RenderPass(stage.scene, stage.camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), strength, 0.72, 0.82);
    composer.addPass(bloom);
    composer.addPass(new FXAAPass());
    composer.addPass(new OutputPass());
  } catch (err) {
    console.warn('post-fx unavailable, falling back to direct render', err);
    composer = null;
    bloom = null;
    enabled = false;
  }

  function drawSize(target) {
    const size = target.getSize ? target.getSize(new THREE.Vector2()) : null;
    return {
      width: Math.max(1, Math.round(size ? size.x : 1)),
      height: Math.max(1, Math.round(size ? size.y : 1)),
    };
  }

  function render(dt) {
    if (!composer || !enabled) {
      renderer.render(stage.scene, stage.camera);
      return;
    }
    composer.render(dt || 0);
  }

  function setSize(width, height) {
    if (!composer) return;
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(Math.max(1, width), Math.max(1, height));
    if (bloom) bloom.setSize(Math.max(1, width), Math.max(1, height));
  }

  function setEnabled(on) {
    enabled = !!on;
  }

  function setStrength(value) {
    if (bloom) bloom.strength = THREE.MathUtils.clamp(Number(value) || 0, 0, 2);
  }

  function dispose() {
    if (!composer) return;
    composer.dispose();
    composer = null;
    bloom = null;
  }

  return { render, setSize, setEnabled, setStrength, dispose, get active() { return !!composer && enabled; } };
}
