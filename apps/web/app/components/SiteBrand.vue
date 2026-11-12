<script setup lang="ts">
import { Landmark } from '@lucide/vue';
import desktopLogo from '../assets/branding/wbs-desktop.jpg';
import mobileLogo from '../assets/branding/wbs-mobile.png';
const { site } = useSiteConfiguration();
defineProps<{ logoOnly?: boolean }>();
</script>
<template>
  <span class="site-brand"
    ><picture v-if="logoOnly" class="site-brand-responsive">
      <source media="(max-width: 700px)" :srcset="mobileLogo" />
      <img
        :src="desktopLogo"
        :alt="`${site.appName} ${site.institutionName}`"
        width="128"
        height="126"
      /> </picture
    ><span v-else class="site-brand-mark"
      ><img v-if="site.logoDataUrl" :src="site.logoDataUrl" alt="" /><Landmark
        v-else
        :size="36" /></span
    ><span v-if="!logoOnly" class="site-brand-name"
      ><strong>{{ site.appName }}</strong
      ><small>{{ site.institutionName }}</small></span
    ></span
  >
</template>
<style scoped>
.site-brand {
  display: inline-flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
  color: inherit;
}
.site-brand-responsive {
  display: block;
  width: 190px;
  max-width: 100%;
}
.site-brand-responsive img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
}
@media (min-width: 701px) {
  .site-brand-responsive img {
    border-radius: 12px;
  }
}
@media (max-width: 700px) {
  .site-brand-responsive {
    width: 56px;
  }
  .site-brand-responsive img {
    aspect-ratio: 1;
  }
}
.site-brand-mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border: 0;
  border-radius: 0;
}
.site-brand-mark img {
  width: 130px;
  height: 100px;
  object-fit: contain;
  padding: 0;
}
.site-brand-name {
  min-width: 0;
}
.site-brand-name strong {
  display: block;
  font-size: 24px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.site-brand-name small {
  display: block;
  font-size: 9px;
  letter-spacing: 0.08em;
  margin-top: 5px;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
</style>
