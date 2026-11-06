import type { Page } from '@playwright/test';
// Explicit browser fixture; production has no test-token bypass.
export async function stubRecaptcha(page: Page) {
  await page.route('**/api/v1/public/captcha', (route) =>
    route.fulfill({ json: { siteKey: 'synthetic-site-key', configured: true } }),
  );
  await page.addInitScript(() => {
    const widgets: { options: any; button: HTMLButtonElement }[] = [];
    (window as any).grecaptcha = {
      render: (element: HTMLElement, options: any) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Verifikasi CAPTCHA';
        button.onclick = () => {
          options.callback('synthetic-captcha-token');
          button.textContent = 'CAPTCHA terverifikasi';
        };
        element.appendChild(button);
        widgets.push({ options, button });
        return widgets.length - 1;
      },
      reset: (id: number) => {
        const widget = widgets[id];
        if (widget) widget.button.textContent = 'Verifikasi CAPTCHA';
      },
    };
  });
}
