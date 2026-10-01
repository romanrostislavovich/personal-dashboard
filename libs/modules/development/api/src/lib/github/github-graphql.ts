import { GithubAuthError } from './github.client';

const GRAPHQL_URL = 'https://api.github.com/graphql';

interface GraphqlOptions {
  /**
   * Take the data even when some fields failed: a query for several repositories answers
   * `null` for a deleted one and reports it in `errors`.
   */
  allowPartial?: boolean;
}

/** One request to the GitHub GraphQL API with the user's token. */
export async function githubGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
  { allowPartial = false }: GraphqlOptions = {},
): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'personal-dashboard',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 401) {
    throw new GithubAuthError('GitHub token is invalid');
  }
  if (!response.ok) {
    throw new Error(`GitHub GraphQL ${response.status}`);
  }
  // GraphQL reports its errors (a missing permission, a rate limit) with status 200.
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!body.data || (body.errors?.length && !allowPartial)) {
    throw new Error(`GitHub: ${body.errors?.map((error) => error.message).join('; ')}`);
  }
  return body.data;
}
