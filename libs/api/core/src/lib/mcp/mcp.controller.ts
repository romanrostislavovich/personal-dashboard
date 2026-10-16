import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessTokenCreated,
  AccessTokenInput,
  accessTokenInputSchema,
  McpInfo,
} from '@pd/contracts';
import type { Response } from 'express';
import { AppConfig } from '../config/env';
import { AiService } from '../ai/ai.service';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { RateLimit } from '../system/rate-limit';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AccessTokensService } from './access-tokens.service';
import { answerMcp, McpTools } from './mcp-protocol';

/**
 * The dashboard as an MCP server: Claude Desktop, Claude Code, Cursor and any other MCP
 * client call the assistant's tools with an access token (`Authorization: Bearer pd_…`).
 * One POST per message, answered with JSON; no stream is kept open (`GET` is refused).
 */
@Controller('mcp')
export class McpController {
  constructor(
    private readonly tokens: AccessTokensService,
    private readonly ai: AiService,
  ) {}

  @Public()
  @Post()
  @RateLimit(300, 60)
  async message(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const owner = await this.tokens.authenticate(authorization);
    if (!owner) {
      response
        .status(401)
        .setHeader('WWW-Authenticate', 'Bearer realm="personal-dashboard"')
        .json({ error: 'An access token is needed: Settings → Integrations → AI clients (MCP)' });
      return;
    }
    const tools: McpTools = {
      list: async () =>
        (await this.ai.outsideTools(owner.userId, owner.scope)).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
          readOnly: !tool.writes,
          destructive: Boolean(tool.confirm),
        })),
      call: async (name, args) => {
        const { output, isError } = await this.ai.callOutside(
          owner.userId,
          name,
          args,
          owner.scope,
        );
        return { text: output, isError };
      },
    };
    const answer = await answerMcp(body, tools);
    if (answer === null) {
      response.status(202).end();
    } else {
      response.status(200).json(answer);
    }
  }

  /** No stream of server messages: this server only answers. */
  @Public()
  @Get()
  stream(@Res() response: Response): void {
    response.status(405).setHeader('Allow', 'POST').end();
  }
}

/** Settings → Integrations → AI clients: the tokens and where to connect. */
@Controller('access-tokens')
export class AccessTokensController {
  constructor(
    private readonly tokens: AccessTokensService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  @Get()
  async info(@CurrentUser() user: AuthUser): Promise<McpInfo> {
    const publicUrl = this.config.get('PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
    return { url: `${publicUrl}/api/mcp`, tokens: await this.tokens.list(user.id) };
  }

  @Post()
  @RateLimit(20, 3600)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(accessTokenInputSchema)) input: AccessTokenInput,
  ): Promise<AccessTokenCreated> {
    return this.tokens.create(user.id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tokens.revoke(user.id, id);
  }
}
