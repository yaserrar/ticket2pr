import 'server-only';
import { env } from '~/server/config/env';
import { claudeRunner } from './claude-runner';
import { fakeRunner } from './fake-runner';
import type { Runner } from './types';

export const runnerName = () => env.RUNNER;

export function getRunner(): Runner {
  return env.RUNNER === 'fake' ? fakeRunner : claudeRunner;
}
