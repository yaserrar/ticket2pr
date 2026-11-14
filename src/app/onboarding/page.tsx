import type { Metadata } from 'next';
import { connection } from 'next/server';
import { OnboardingFlow } from '~/components/onboarding/onboarding-flow';
import { settingsService } from '~/server/modules/settings/settings.service';

export const metadata: Metadata = { title: 'Get started' };

export default async function OnboardingPage() {
  await connection();
  const settings = await settingsService.get();
  return <OnboardingFlow initialSettings={settings} />;
}
