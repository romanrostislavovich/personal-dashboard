import {jsonLogs, SystemLogger} from './system-logger';
import {withTrace} from './trace';

describe('SystemLogger', () => {
  it('writes JSON in production unless told otherwise', () => {
    expect(jsonLogs({NODE_ENV: 'production'})).toBe(true);
    expect(jsonLogs({NODE_ENV: 'production', LOG_FORMAT: 'text'})).toBe(false);
    expect(jsonLogs({LOG_FORMAT: 'json'})).toBe(true);
    expect(jsonLogs({})).toBe(false);
  });

  it('puts the request or job id into every JSON line', () => {
    const lines: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(chunk => {
        lines.push(String(chunk));
        return true;
      });
    try {
      const logger = new SystemLogger({json: true});
      withTrace({id: 'abc123', job: 'tasks.remind'}, () =>
        logger.log('Running', 'Scheduler'),
      );
      logger.log('Outside', 'Scheduler');
    } finally {
      write.mockRestore();
    }
    const [inside, outside] = lines.map(
      line => JSON.parse(line) as Record<string, unknown>,
    );
    expect(inside).toMatchObject({
      message: 'Running',
      traceId: 'abc123',
      job: 'tasks.remind',
    });
    expect(outside['traceId']).toBeUndefined();
  });
});
