<script setup lang="ts">
import {
  Scale,
  HandCoins,
  FileWarning,
  UserRoundCog,
  GitFork,
  GraduationCap,
  Accessibility,
  ShieldAlert,
  MessageSquareWarning,
} from '@lucide/vue';
defineProps<{ index: number; compact?: boolean }>();
const icons = [
  Scale,
  HandCoins,
  FileWarning,
  UserRoundCog,
  GitFork,
  GraduationCap,
  Accessibility,
  ShieldAlert,
  MessageSquareWarning,
];
</script>
<template>
  <span class="report-type-icon" :class="{ compact }" aria-hidden="true"
    ><component :is="icons[index] || FileWarning" :size="compact ? 18 : 24" :stroke-width="1.8"
  /></span>
</template>
<style scoped>
.report-type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  color: var(--green);
  background: var(--academic-soft);
  border: 1px solid var(--border);
  box-shadow: inset 0 3px 0 #d6b566;
}
.report-type-icon.compact {
  width: 34px;
  height: 34px;
  border-radius: 9px;
}
</style>
