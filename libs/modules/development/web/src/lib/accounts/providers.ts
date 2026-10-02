import { CodeProvider } from '@pd/contracts';

/** The services by the names they call themselves. */
export const PROVIDER_NAMES: Record<CodeProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};
