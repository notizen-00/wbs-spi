import { test, expect } from '@playwright/test';
test.use({ baseURL: 'http://127.0.0.1:3000' });
for (const reduced of [false, true]) {
  test(`animasi scroll landing ${reduced ? 'mengikuti pengurangan animasi' : 'muncul saat konten terlihat'}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/me')) return route.fulfill({ status: 401, json: {} });
      if (path.endsWith('/public/statistics'))
        return route.fulfill({
          json: { total: 0, active: 0, completed: 0, closed: 0, categories: [], monthly: [] },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto('/');
    const hero = page.locator('.public-hero-copy');
    await expect(hero).toBeVisible();
    const step = page.locator('.public-steps li').first();
    await step.scrollIntoViewIfNeeded();
    if (reduced) {
      await expect(hero).not.toHaveClass(/scroll-revealed/);
      await expect(step).toHaveCSS('animation-name', 'none');
    } else {
      await expect(hero).toHaveClass(/scroll-revealed/);
      await expect(step).toHaveClass(/scroll-revealed/);
      await expect(step).toHaveCSS('animation-name', /^landing-scroll-reveal/);
    }
    await expect(step).toBeVisible();
    await page.setViewportSize({ width: 390, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
