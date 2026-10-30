import {z} from 'zod';

// Access tokens: how an outside AI client (Claude Desktop, Claude Code, Cursor — over MCP)
// reaches the user's data, without the password and apart from the sessions of the apps.

/** `read` — the tools that only read; `write` — those that change data too. */
export const ACCESS_TOKEN_SCOPES = ['read', 'write'] as const;
export type AccessTokenScope = (typeof ACCESS_TOKEN_SCOPES)[number];

/** Every token starts with it: told apart from a session's token at a glance. */
export const ACCESS_TOKEN_PREFIX = 'pd_';

export const accessTokenInputSchema = z.object({
  /** Where it is used: "Claude Desktop at home". */
  name: z.string().trim().min(1).max(60),
  scope: z.enum(ACCESS_TOKEN_SCOPES),
});
export type AccessTokenInput = z.infer<typeof accessTokenInputSchema>;

export interface AccessToken {
  id: string;
  name: string;
  scope: AccessTokenScope;
  /** The first characters, to tell the tokens apart (the rest is never shown again). */
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** The token itself is in the answer once, right after it is made. */
export interface AccessTokenCreated extends AccessToken {
  token: string;
}

/** Where an MCP client connects: the server's address and this instance's. */
export interface McpInfo {
  /** `https://dash.example.com/api/mcp`. */
  url: string;
  tokens: AccessToken[];
}
