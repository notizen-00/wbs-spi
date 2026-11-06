<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue';
const { site } = useSiteConfiguration();
</script>
<template>
  <span class="site-brand"
    ><span class="site-brand-mark"
      ><img v-if="site.logoDataUrl" :src="site.logoDataUrl" alt="" /><ShieldCheck
        v-else
        :size="27" /></span
    ><span class="site-brand-name"
      ><strong>{{ site.appName }}</strong
      ><small>{{ site.institutionName }}</small></span
    ></span
  >
</template>
<style scoped>
.site-brand {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  color: inherit;
}
.site-brand-mark {
  display: grid;
  place-items: center;
  width: 43px;
  height: 48px;
  flex-shrink: 0;
  border: 1px solid #a4b19b;
  border-radius: 3px 3px 13px 13px;
  overflow: hidden;
}
.site-brand-mark img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 3px;
}
.site-brand-name {
  min-width: 0;
}
.site-brand-name strong {
  display: block;
  font-size: 22px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.site-brand-name small {
  display: block;
  font-size: 8px;
  letter-spacing: 0.08em;
  margin-top: 5px;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
</style>
