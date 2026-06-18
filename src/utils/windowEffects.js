const SUPPORT_BY_OS = {
  windows: new Set(['none', 'blur', 'acrylic', 'mica']),
  macos: new Set(['none', 'blur']),
  linux: new Set(['none']),
  default: new Set(['none']),
};

export const WINDOW_EFFECTS = [
  { value: 'none', label: 'Net', description: 'Fond opaque, rendu stable partout.' },
  { value: 'blur', label: 'Flou', description: 'Transparence douce derrière la fenêtre.' },
  { value: 'acrylic', label: 'Acrylic', description: 'Effet Windows plus texturé.' },
  { value: 'mica', label: 'Mica', description: 'Intégré à Windows 11.' },
];

export function isWindowEffectSupported(effect = 'none', osType = '') {
  const key = osType || 'default';
  const supported = SUPPORT_BY_OS[key] || SUPPORT_BY_OS.default;
  return supported.has(effect);
}

export function getCompatibleWindowEffect(effect = 'none', osType = '') {
  return isWindowEffectSupported(effect, osType) ? effect : 'none';
}
