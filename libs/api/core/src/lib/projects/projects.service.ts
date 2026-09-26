import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Project, ProjectInput } from '@pd/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { isForeignKeyViolation } from '../database/pg-errors';
import { projects } from './projects.schema';

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

  /** Для модулей: убедиться, что проект существует и принадлежит пользователю. */
  async assertOwned(userId: string, projectId: string): Promise<void> {
    const count = await this.db.$count(
      projects,
      and(eq(projects.id, projectId), eq(projects.userId, userId)),
    );
    if (count === 0) {
      throw new NotFoundException('Project not found');
    }
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
      // Модули защищают свои данные внешними ключами (например, финансовые операции проекта).
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
    createdAt: row.createdAt.toISOString(),
  };
}
