import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AiAttachment,
  AiChatMessage,
  AiChatResponse,
  AiConversation,
  AiConversationDetail,
  AiStoredMessage,
} from '@pd/contracts';
import { and, asc, desc, eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { AiConversationRow, aiConversations, AiMessageRow, aiMessages } from './ai.schema';
import { AiService, AskOptions } from './ai.service';

/** The model gets this many recent messages of the conversation as context. */
const CONTEXT_MESSAGES = 20;
/** The archive shows this many recent conversations. */
const LIST_LIMIT = 50;
const TITLE_LENGTH = 80;

export interface Question {
  /** Missing — the current conversation (or a new one before the first). */
  conversationId?: string;
  content: string;
  attachments?: AiAttachment[];
}

export interface NewMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: AiAttachment[];
  toolsUsed?: string[];
}

/**
 * Stored conversations with the assistant, shared by the web chat and Telegram, so a
 * conversation survives a reload, a new session and a redeploy.
 */
@Injectable()
export class AiConversationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ai: AiService,
  ) {}

  /** Asks within a conversation: the model sees its recent messages, both turns are saved. */
  async ask(userId: string, question: Question, options: AskOptions): Promise<AiChatResponse> {
    const conversation = await this.resolve(userId, question.conversationId);
    const message: NewMessage = {
      role: 'user',
      content: question.content,
      ...(question.attachments?.length ? { attachments: question.attachments } : {}),
    };
    const history = [...(await this.context(conversation.id)), message];
    const { reply, toolsUsed } = await this.ai.ask(userId, history, options);
    await this.append(userId, conversation, [
      message,
      { role: 'assistant', content: reply, toolsUsed },
    ]);
    return { conversationId: conversation.id, reply, toolsUsed };
  }

  async list(userId: string): Promise<AiConversation[]> {
    const rows = await this.db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.updatedAt))
      .limit(LIST_LIMIT);
    return rows.map(toConversation);
  }

  /** The conversation updated last, with its messages; `null` before the first one. */
  async current(userId: string): Promise<AiConversationDetail | null> {
    const row = await this.currentRow(userId);
    return row ? this.withMessages(row) : null;
  }

  async get(userId: string, id: string): Promise<AiConversationDetail> {
    return this.withMessages(await this.find(userId, id));
  }

  /** Starts an empty conversation; it becomes the current one. */
  async start(userId: string): Promise<AiConversationDetail> {
    const [row] = await this.db.insert(aiConversations).values({ userId }).returning();
    return { ...toConversation(row), messages: [] };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(aiConversations)
      .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
  }

  /** The given conversation, or the current one, or a new one; checks ownership. */
  async resolve(userId: string, id?: string): Promise<AiConversationRow> {
    if (id) {
      return this.find(userId, id);
    }
    return (await this.currentRow(userId)) ?? (await this.createRow(userId));
  }

  /** The recent messages as the model gets them. */
  async context(conversationId: string): Promise<AiChatMessage[]> {
    const rows = await this.db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(desc(aiMessages.createdAt))
      .limit(CONTEXT_MESSAGES);
    return rows.reverse().map(({ role, content, attachments }) => ({
      role,
      content,
      ...(attachments.length ? { attachments } : {}),
    }));
  }

  /**
   * Saves a question and its answer together (a failed answer saves nothing, so a retry does
   * not repeat the question) and makes the conversation the current one.
   */
  async append(
    userId: string,
    conversation: AiConversationRow,
    messages: NewMessage[],
  ): Promise<void> {
    const now = Date.now();
    await this.db.transaction(async (tx) => {
      await tx.insert(aiMessages).values(
        messages.map((message, index) => ({
          conversationId: conversation.id,
          userId,
          role: message.role,
          content: message.content,
          attachments: message.attachments ?? [],
          toolsUsed: message.toolsUsed ?? [],
          // One statement gives every row the same now(): keep the order explicit.
          createdAt: new Date(now + index),
        })),
      );
      const firstQuestion = messages.find((message) => message.role === 'user');
      await tx
        .update(aiConversations)
        .set({
          updatedAt: new Date(now),
          ...(!conversation.title && firstQuestion && { title: titleOf(firstQuestion) }),
        })
        .where(eq(aiConversations.id, conversation.id));
    });
  }

  private async currentRow(userId: string): Promise<AiConversationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.updatedAt))
      .limit(1);
    return row;
  }

  private async createRow(userId: string): Promise<AiConversationRow> {
    const [row] = await this.db.insert(aiConversations).values({ userId }).returning();
    return row;
  }

  private async find(userId: string, id: string): Promise<AiConversationRow> {
    const [row] = await this.db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
    if (!row) {
      throw new NotFoundException('Conversation not found');
    }
    return row;
  }

  private async withMessages(row: AiConversationRow): Promise<AiConversationDetail> {
    const messages = await this.db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, row.id))
      .orderBy(asc(aiMessages.createdAt));
    return { ...toConversation(row), messages: messages.map(toStoredMessage) };
  }
}

function toConversation(row: AiConversationRow): AiConversation {
  return { id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() };
}

function toStoredMessage(row: AiMessageRow): AiStoredMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    attachments: row.attachments.map((attachment) => attachment.name),
    toolsUsed: row.toolsUsed,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The question, or the file name for a file sent without a comment. */
function titleOf(message: NewMessage): string {
  const text = message.content.trim() || message.attachments?.[0]?.name || '…';
  const line = text.split('\n')[0];
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH).trimEnd()}…` : line;
}
