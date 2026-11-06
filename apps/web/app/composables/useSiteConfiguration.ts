export interface SiteConfiguration {
  appName: string;
  institutionName: string;
  tagline: string;
  helpEmail: string;
  helpPhone: string;
  helpAddress: string;
  logoDataUrl: string | null;
  categories: string[];
}
export function useSiteConfiguration() {
  const site = useState<SiteConfiguration>('site-configuration', () => ({
    appName: 'WBS',
    institutionName: 'Universitas Jember',
    tagline: 'Whistleblowing System',
    helpEmail: '',
    helpPhone: '',
    helpAddress: '',
    logoDataUrl: null,
    categories: [
      'Penyalahgunaan wewenang',
      'Korupsi & gratifikasi',
      'Pelanggaran akademik',
      'Pelanggaran etika',
      'Pengadaan barang & jasa',
      'Pelanggaran lainnya',
      'Pungutan liar',
    ],
  }));
  async function reloadSite() {
    const result = await $fetch<SiteConfiguration>('/api/v1/public/settings');
    if (result && typeof result.appName === 'string' && Array.isArray(result.categories))
      site.value = result;
  }
  return { site, reloadSite };
}
