import { describe, expect, it } from 'vitest';
import { getCompatibleWindowEffect, isWindowEffectSupported } from './windowEffects';

describe('window effect compatibility', () => {
  it('autorise les effets Windows complets', () => {
    expect(isWindowEffectSupported('mica', 'windows')).toBe(true);
    expect(isWindowEffectSupported('acrylic', 'windows')).toBe(true);
  });

  it('bloque les effets non compatibles sur macOS et Linux', () => {
    expect(isWindowEffectSupported('mica', 'macos')).toBe(false);
    expect(isWindowEffectSupported('blur', 'macos')).toBe(true);
    expect(isWindowEffectSupported('blur', 'linux')).toBe(false);
  });

  it('revient à aucun effet lorsqu’un effet est incompatible', () => {
    expect(getCompatibleWindowEffect('mica', 'linux')).toBe('none');
    expect(getCompatibleWindowEffect('blur', 'macos')).toBe('blur');
  });
});
