import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password';

describe('hashPassword / verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('korrekt-pferd-batterie');
    await expect(verifyPassword('korrekt-pferd-batterie', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('korrekt-pferd-batterie');
    await expect(verifyPassword('korrekt-pferd-batterei', hash)).resolves.toBe(false);
  });

  it('is case sensitive', async () => {
    const hash = await hashPassword('GeheimesWort');
    await expect(verifyPassword('geheimeswort', hash)).resolves.toBe(false);
  });

  it('salts each hash, so the same password never produces the same string', async () => {
    const a = await hashPassword('dasselbe-passwort');
    const b = await hashPassword('dasselbe-passwort');
    expect(a).not.toBe(b);
    await expect(verifyPassword('dasselbe-passwort', a)).resolves.toBe(true);
    await expect(verifyPassword('dasselbe-passwort', b)).resolves.toBe(true);
  });

  it('never stores the password itself', async () => {
    const hash = await hashPassword('klartext-geheim');
    expect(hash).not.toContain('klartext-geheim');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('handles umlauts and unicode-equivalent spellings', async () => {
    const hash = await hashPassword('Grüße-Käse-99');
    await expect(verifyPassword('Grüße-Käse-99'.normalize('NFD'), hash)).resolves.toBe(
      true,
    );
  });

  // An account that has no password yet (created before the switch to
  // email/password sign-in) must never authenticate - not even with an empty
  // password.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('rejects any password when the stored hash is %s', async (_label, stored) => {
    await expect(verifyPassword('irgendwas', stored)).resolves.toBe(false);
    await expect(verifyPassword('', stored)).resolves.toBe(false);
  });

  it.each([
    ['garbage', 'nicht-wirklich-ein-hash'],
    ['unknown algorithm', 'bcrypt$16384$8$1$c2FsdA==$aGFzaA=='],
    ['too few fields', 'scrypt$16384$8$1$c2FsdA=='],
    ['non-numeric parameters', 'scrypt$N$r$p$c2FsdA==$aGFzaA=='],
  ])('rejects a stored value that is %s', async (_label, stored) => {
    await expect(verifyPassword('irgendwas', stored)).resolves.toBe(false);
  });
});
