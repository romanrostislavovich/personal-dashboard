import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Project, projectInputSchema } from '@pd/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB, Database } from '../database/database.module';
import { isForeignKeyViolation } from '../database/pg-errors';
import { projects } from './projects.schema';

type ProjectInput = z.output<typeof projectInputSchema>;

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<Project[]> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(asc(projects.name));
    return rows.map(toProject);
  }

  /** For modules: make sure the project exists and belongs to the user. */
  async assertOwned(userId: string, projectId: string): Promise<void> {
    const count = await this.db.$count(
      projects,
      and(eq(projects.id, projectId), eq(projects.userId, userId)),
    );
    if (count === 0) {
      throw new NotFoundException('Project not found');
    }
  }

  /** One project of the user. */
  async get(userId: string, id: string): Promise<Project> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
    if (!row) {
      throw new NotFoundException('Project not found');
    }
    return toProject(row);
  }

  async create(userId: string, input: ProjectInput): Promise<Project> {
    const [row] = await this.db
      .insert(projects)
      .values({ userId, ...input })
      .returning();
    return toProject(row);
  }

  async update(userId: string, id: string, input: ProjectInput): Promise<Project> {
    const [row] = await this.db
      .update(projects)
      .set(input)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return toProject(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    try {
      await this.db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
    } catch (error) {
      // Modules protect their data with foreign keys (for example, a project's financial transactions).
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('Project is used by other records');
      }
      throw error;
    }
  }
}

function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    description: row.description,
    aliases: row.aliases,
    createdAt: row.createdAt.toISOString(),
  };
}
