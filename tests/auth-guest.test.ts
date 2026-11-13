import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../apps/api/src/auth/auth.service';

test('sesi tamu selalu menjadi pelapor dan cookie tidak dapat dibaca JavaScript', async () => {
  let created: any;
  let cookie: any[] = [];
  const auth = new AuthService({
    user: {
      create: async ({ data }: any) => {
        created = data;
        return { ...data, id: 'guest-id', authVersion: 1 };
      },
    },
  } as any);
  auth.rate = async () => {};
  auth.redis.set = (async () => 'OK') as any;
  try {
    const user = await auth.guest(
      { cookies: {}, body: { role: 'SUPER_ADMIN' } } as any,
      {
        cookie: (...args: any[]) => {
          cookie = args;
        },
      } as any,
    );
    assert.equal(user.role, 'REPORTER');
    assert.equal(user.verified, true);
    assert.match(created.email, /^guest-.*@guest\.invalid$/);
    assert.equal('passwordHash' in user, false);
    assert.equal(cookie[0], 'wbs_session');
    assert.equal(cookie[2].httpOnly, true);
    assert.equal(cookie[2].sameSite, 'strict');
    auth.session = async () => user;
    created = undefined;
    assert.deepEqual(
      await auth.guest({ cookies: { wbs_session: cookie[1] } } as any, {} as any),
      user,
    );
    assert.equal(created, undefined);
  } finally {
    auth.onModuleDestroy();
  }
});
