import { Injectable, Logger } from '@nestjs/common';
import { AiService, UsersService } from '@pd/api-core';
import { DiskAction, DiskAdvice, DiskReport, DiskSafety, DiskSuggestion } from '@pd/contracts';
import { fixOf, mustNotTrash, reportPaths, ruleAdvice } from './disk-rules';

const ACTIONS: DiskAction[] = ['trash', 'command', 'tool', 'review'];
const SAFETIES: DiskSafety[] = ['safe', 'check', 'risky'];
const MAX_SUGGESTIONS = 25;
const GB = 1024 ** 3;

const INSTRUCTION = `You help free space on a full Windows disk. You get a JSON report: the disk's
size and free space, its biggest folders and files (paths, bytes, files inside, last change),
places known to grow ("known") with the built-in advice for them ("rules"), and the other disks
of the computer with their free space ("otherDisks").

Answer with JSON only, no other text:
{"summary": "two sentences: what takes the space and how much can be freed",
 "suggestions": [{"path": "a path exactly as in the report", "action": "trash|command|tool|review",
   "safety": "safe|check|risky", "reason": "one or two sentences for the user",
   "how": "for command/tool: the exact command or where to click; otherwise null"}]}

Rules:
- Use only paths that are in the report, written exactly the same.
- Look through ALL the big folders and files, not only the known places: name what each one is
  (a game, an IDE, a program's data, a model file of a browser…) and say what to do with it.
  For a file a program downloads again by itself (for example the on-device AI model of Chrome
  in OptGuideOnDeviceModel) say how to switch that off first.
- When another disk has far more free space, suggest moving big programs, games and their
  data there ("tool"), with the exact way: Steam — Settings → Storage → move; Battle.net — the
  game's settings → Locate/Install on another disk; Spotify — Settings → Storage → change the
  location; Docker Desktop — Settings → Resources → Disk image location; for others — reinstall
  to the other disk. Name the disk to move to.
- "trash" (the app moves it to the Recycle Bin) only for things that are rebuilt by themselves
  or plainly leftovers: caches, temp files, crash dumps, old installers, logs, build outputs
  (node_modules, bin/obj, target, dist) of projects untouched for months.
- Never "trash" the system, programs, virtual disks (.vhdx), games' own folders or the user's
  documents, photos, projects: for those "review" with a reason, or a "tool"/"command".
- "safe" — rebuilt by itself; "check" — most likely unneeded, look first; "risky" — the user's own data.
- Write sizes in gigabytes with one decimal ("GB", in Russian "ГБ"), never GiB/ГиБ.
- Prefer big wins over many small ones; at most ${MAX_SUGGESTIONS} suggestions, biggest first.`;

/**
 * Advice on what to delete from a full disk. The AI reads the report of the desktop app; its
 * answer is checked: paths must come from the report, the system and virtual disks are never
 * offered for the Recycle Bin. Without the AI (or when it fails) the built-in rules answer.
 */
@Injectable()
export class DiskAdviceService {
  private readonly logger = new Logger(DiskAdviceService.name);

  constructor(
    private readonly ai: AiService,
    private readonly users: UsersService,
  ) {}

  async advise(userId: string, report: DiskReport): Promise<DiskAdvice> {
    const locale = (await this.users.findById(userId))?.locale ?? 'en';
    const rules = ruleAdvice(report, locale);
    const fallback = {
      suggestions: rules,
      summary: summaryOf(report, rules, locale),
      byAi: false,
    };
    if (!(await this.ai.isConfigured(userId)) || !(await this.ai.canSee(userId, 'activity'))) {
      return fallback;
    }
    try {
      const answer = await this.ai.complete(
        userId,
        INSTRUCTION,
        JSON.stringify({ ...report, rules }),
        'activity',
      );
      const advice = parseAdvice(answer, report);
      return advice ?? fallback;
    } catch (error) {
      this.logger.warn(`Disk advice from the AI failed: ${(error as Error).message}`);
      return fallback;
    }
  }
}

/** The AI's answer, checked against the report; `null` when it is not usable. */
export function parseAdvice(answer: string, report: DiskReport): DiskAdvice | null {
  const json = answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1);
  let raw: { summary?: unknown; suggestions?: unknown };
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw.suggestions)) {
    return null;
  }
  const sizes = reportPaths(report);
  const seen = new Set<string>();
  const suggestions = raw.suggestions.flatMap((item: Record<string, unknown>): DiskSuggestion[] => {
    const path = typeof item['path'] === 'string' ? item['path'] : '';
    const bytes = sizes.get(path);
    if (bytes === undefined || seen.has(path)) {
      return [];
    }
    seen.add(path);
    let action = ACTIONS.includes(item['action'] as DiskAction)
      ? (item['action'] as DiskAction)
      : 'review';
    const safety = SAFETIES.includes(item['safety'] as DiskSafety)
      ? (item['safety'] as DiskSafety)
      : 'check';
    if (action === 'trash' && mustNotTrash(path)) {
      action = 'review';
    }
    return [
      {
        path,
        bytes,
        action,
        safety,
        reason: String(item['reason'] ?? '').slice(0, 500),
        how: typeof item['how'] === 'string' && item['how'] ? item['how'].slice(0, 300) : null,
        fix: fixOf(report, path),
      },
    ];
  });
  return {
    suggestions: suggestions.sort((a, b) => b.bytes - a.bytes).slice(0, MAX_SUGGESTIONS),
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 600) : '',
    byAi: true,
  };
}

function summaryOf(report: DiskReport, rules: DiskSuggestion[], locale: string): string {
  const gb = (bytes: number) => (bytes / GB).toFixed(1);
  const freeable = rules
    .filter((rule) => rule.safety === 'safe')
    .reduce((sum, rule) => sum + rule.bytes, 0);
  return locale === 'ru'
    ? `Диск ${report.mount} — свободно ${gb(report.free)} из ${gb(report.total)} ГБ. Известные кэши и временные файлы: безопасно можно освободить около ${gb(freeable)} ГБ.`
    : `Disk ${report.mount}: ${gb(report.free)} of ${gb(report.total)} GB free. Known caches and temporary files: about ${gb(freeable)} GB can go safely.`;
}
