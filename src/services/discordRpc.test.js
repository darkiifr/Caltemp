import { describe, expect, it } from 'vitest';
import { DISCORD_RPC_CLIENT_ID, buildDiscordPresence } from './discordRpc';

describe('discordRpc', () => {
  it('uses the configured Discord application client id', () => {
    expect(DISCORD_RPC_CLIENT_ID).toBe('1516083174931824720');
  });

  it('builds privacy-safe presence without event details', () => {
    const presence = buildDiscordPresence({
      section: 'calendar',
      view: 'month',
      currentEventTitle: 'Rendez-vous médical',
      startedAt: 1000,
    });

    expect(presence.clientId).toBe('1516083174931824720');
    expect(JSON.stringify(presence)).not.toContain('Rendez-vous médical');
    expect(presence.activity.details).toBe('Organise son calendrier');
    expect(presence.activity.state).toBe('Vue mois');
  });
});
