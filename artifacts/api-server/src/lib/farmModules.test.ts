import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FARM_MODULES, canUseModule, cleanFarmModules, moduleOfRequest } from './farmModules';

describe('Modul-Freigaben', () => {
  it('knows the module of each farm route', () => {
    expect(moduleOfRequest('GET', '/farms/3/tasks')).toBe('farm-tasks');
    expect(moduleOfRequest('POST', '/farms/3/feed-stock/12/use')).toBe('feed');
    expect(moduleOfRequest('GET', '/farms/3/camera-events')).toBe('wildlife');
    expect(moduleOfRequest('GET', '/farms/3/beds/4/plantings')).toBe('garden');
    expect(moduleOfRequest('GET', '/farms/3/members')).toBe('members');
    // Basics and the emergency numbers stay open, leaving too.
    expect(moduleOfRequest('GET', '/farms/3/animals')).toBeNull();
    expect(moduleOfRequest('GET', '/farms/3')).toBeNull();
    expect(moduleOfRequest('GET', '/farms/3/contacts')).toBeNull();
    expect(moduleOfRequest('DELETE', '/farms/3/members/u1')).toBeNull();
  });

  it('gives every farm route a module, or names it as one of the basics', () => {
    // Open to every member on purpose (docs/team.md): the farm's basics.
    const BASICS = ['ai', 'animals', 'contacts', 'farming', 'sustainability', 'herds', 'husbandry', 'location', 'medical', 'setup', 'weather', 'weights'];
    const dir = join(__dirname, '../routes');
    const segments = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      for (const m of readFileSync(join(dir, file), 'utf8').matchAll(/'\/farms\/:farmId\/([^/']+)/g)) segments.add(m[1]!);
    }
    expect(segments.size).toBeGreaterThan(20);
    for (const segment of segments) {
      expect(moduleOfRequest('GET', `/farms/3/${segment}`) !== null || BASICS.includes(segment), segment).toBe(true);
    }
  });

  it('lets admins and members without a list use everything', () => {
    expect(canUseModule('admin', ['feed'], 'farm-tasks')).toBe(true);
    expect(canUseModule('caretaker', null, 'farm-tasks')).toBe(true);
    expect(canUseModule('caretaker', ['feed'], 'farm-tasks')).toBe(false);
    expect(canUseModule('guest', ['feed'], 'feed')).toBe(true);
  });

  it('keeps only known farm modules, in order', () => {
    expect(cleanFarmModules(null)).toBeNull();
    expect(cleanFarmModules(['garden', 'grow', 'feed', 'feed'])).toEqual(['feed', 'garden']);
    expect(FARM_MODULES).toContain('members');
  });
});
