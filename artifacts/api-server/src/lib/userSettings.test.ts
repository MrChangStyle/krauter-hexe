import { describe, expect, it } from 'vitest';

import { berlinClock, cleanTopics, inQuietHours } from './userSettings';

describe('Benachrichtigungen', () => {
  it('knows the quiet time, also across midnight', () => {
    const night = { from: '22:00', to: '06:30' };
    expect(inQuietHours(night, '23:15')).toBe(true);
    expect(inQuietHours(night, '03:00')).toBe(true);
    expect(inQuietHours(night, '06:30')).toBe(false);
    expect(inQuietHours(night, '12:00')).toBe(false);
    const noon = { from: '12:00', to: '14:00' };
    expect(inQuietHours(noon, '13:00')).toBe(true);
    expect(inQuietHours(noon, '14:00')).toBe(false);
    expect(inQuietHours(null, '03:00')).toBe(false);
  });

  it('reads the Berlin clock', () => {
    expect(berlinClock(new Date('2026-01-15T22:05:00Z'))).toBe('23:05');
    expect(berlinClock(new Date('2026-07-15T22:05:00Z'))).toBe('00:05');
  });

  it('keeps known topics only', () => {
    expect(cleanTopics(['feed', 'kein-thema', 'feed', 'wildlife'])).toEqual(['feed', 'wildlife']);
  });
});
