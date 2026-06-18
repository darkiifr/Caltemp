import { describe, expect, it } from 'vitest';
import { getProviderMeta, OPENROUTER_MODELS } from './aiModels';

describe('AI model catalogue', () => {
  it('exposes OpenRouter models with provider metadata', () => {
    expect(OPENROUTER_MODELS.length).toBeGreaterThan(0);

    const openai = getProviderMeta('openai/gpt-4o-mini');
    expect(openai.name).toBe('OpenAI');
    expect(openai.icon).toBe('AI');

    const anthropic = getProviderMeta('anthropic/claude-3.5-sonnet');
    expect(anthropic.name).toBe('Anthropic');
  });

  it('falls back to a custom provider badge for unknown model ids', () => {
    expect(getProviderMeta('custom/model')).toMatchObject({
      name: 'Modèle personnalisé',
      icon: 'M',
    });
  });
});
