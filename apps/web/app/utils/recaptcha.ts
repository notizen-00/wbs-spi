export type RecaptchaApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => number;
  reset: (id: number) => void;
};
let pending: Promise<RecaptchaApi> | undefined;
export function loadRecaptcha() {
  if (pending) return pending;
  pending = new Promise<RecaptchaApi>((resolve, reject) => {
    const scope = window as unknown as { grecaptcha?: RecaptchaApi; wbsCaptchaReady?: () => void };
    if (scope.grecaptcha?.render) {
      resolve(scope.grecaptcha);
      return;
    }
    const script = document.createElement('script');
    const timer = setTimeout(
      () => finish(new Error('reCAPTCHA tidak dapat dimuat. Periksa koneksi Anda.')),
      15000,
    );
    function finish(error?: Error) {
      clearTimeout(timer);
      delete scope.wbsCaptchaReady;
      if (error) {
        pending = undefined;
        script.remove();
        reject(error);
      } else if (scope.grecaptcha) resolve(scope.grecaptcha);
    }
    scope.wbsCaptchaReady = () => finish();
    script.src =
      'https://www.google.com/recaptcha/api.js?onload=wbsCaptchaReady&render=explicit&hl=id';
    script.async = true;
    script.defer = true;
    script.onerror = () => finish(new Error('reCAPTCHA tidak dapat dimuat. Coba kembali.'));
    document.head.appendChild(script);
  });
  return pending;
}
