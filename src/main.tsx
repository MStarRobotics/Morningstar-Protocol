import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';
import { TextDecoder, TextEncoder } from 'util';
import { initMonitoring } from './services/monitoring';
import './styles/runtime-theme.css';
import RootApp from './RootApp';

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
}

if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = TextDecoder;
}

function applyReducedEffectsClass(): void {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compactViewport = window.matchMedia('(max-width: 768px)').matches;
  const lowPowerDevice = (
    (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) ||
    (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4)
  );

  if (prefersReducedMotion || compactViewport || lowPowerDevice) {
    document.documentElement.classList.add('reduced-effects');
  } else {
    document.documentElement.classList.remove('reduced-effects');
  }
}

applyReducedEffectsClass();

// Initialise error tracking / APM before rendering
initMonitoring();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
);
