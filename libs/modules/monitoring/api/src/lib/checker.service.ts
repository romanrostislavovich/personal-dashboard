import { Inject, Injectable } from '@nestjs/common';
import { DB, Database, projects } from '@pd/api-core';
import { eq, lt, sql } from 'drizzle-orm';
import { checkHttp } from './checks/http-check';
import { fetchSslExpiry } from './checks/ssl-check';
import { checkResults, MonitorRow, monitors } from './monitoring.schema';
import { applyCheck, MonitorEvent } from './state/monitor-state';

/** Событие для уведомления вместе с тем, кому и про что его отправлять. */
export interface MonitorNotice {
  userId: string;
  projectName: string;
  url: string;
  event: MonitorEvent;
  error: string | null;
}

export interface SslNotice {
  userId: string;
  projectName: string;
  url: string;
  expiresAt: Date;
}

const RESULTS_RETENTION_DAYS = 35;

/** Выполняет проверки и обновляет состояние мониторов. */
@Injectable()
export class CheckerService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Проверяет все мониторы всех пользователей; возвращает события «упал/поднялся». */
  async checkAll(): Promise<MonitorNotice[]> {
    const rows = await this.monitorsWithProjects();
    const notices = await Promise.all(
      rows.map((row) => this.checkOne(row.monitor, row.projectName)),
    );
    return notices.filter((notice): notice is MonitorNotice => notice !== null);
  }

  async checkOne(monitor: MonitorRow, projectName: string): Promise<MonitorNotice | null> {
    const result = await checkHttp(monitor.url);
    const now = new Date();
    const { state, event } = applyCheck(monitor, result.isUp, now);

    await this.db.insert(checkResults).values({
      monitorId: monitor.id,
      checkedAt: now,
      isUp: result.isUp,
      statusCode: result.statusCode,
      responseMs: result.responseMs,
    });
    await this.db
      .update(monitors)
      .set({
        ...state,
        lastCheckedAt: now,
        lastStatusCode: result.statusCode,
        lastResponseMs: result.responseMs,
        lastError: result.error,
      })
      .where(eq(monitors.id, monitor.id));

    return event
      ? { userId: monitor.userId, projectName, url: monitor.url, event, error: result.error }
      : null;
  }

  /** Обновляет даты SSL-сертификатов; возвращает все https-мониторы с известной датой. */
  async refreshSsl(): Promise<SslNotice[]> {
    const rows = await this.monitorsWithProjects();
    const notices: SslNotice[] = [];
    for (const { monitor, projectName } of rows) {
      const expiresAt = await this.updateSsl(monitor);
      if (expiresAt) {
        notices.push({ userId: monitor.userId, projectName, url: monitor.url, expiresAt });
      }
    }
    return notices;
  }

  /** Первая проверка сразу после добавления, чтобы не ждать 5 минут до появления статуса. */
  async checkNew(monitor: MonitorRow): Promise<void> {
    await Promise.all([this.checkOne(monitor, ''), this.updateSsl(monitor)]);
  }

  private async updateSsl(monitor: MonitorRow): Promise<Date | null> {
    const expiresAt = await fetchSslExpiry(monitor.url);
    if (expiresAt) {
      await this.db
        .update(monitors)
        .set({ sslExpiresAt: expiresAt })
        .where(eq(monitors.id, monitor.id));
    }
    return expiresAt;
  }

  /** Старые результаты проверок больше не нужны: статистика считается максимум за 30 дней. */
  async deleteOldResults(): Promise<void> {
    await this.db
      .delete(checkResults)
      .where(
        lt(checkResults.checkedAt, sql`now() - make_interval(days => ${RESULTS_RETENTION_DAYS})`),
      );
  }

  private monitorsWithProjects() {
    return this.db
      .select({ monitor: monitors, projectName: projects.name })
      .from(monitors)
      .innerJoin(projects, eq(projects.id, monitors.projectId));
  }
}
