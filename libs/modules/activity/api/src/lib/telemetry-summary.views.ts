import {DailyMetric, LifeCard, LifeEvent} from '@pd/contracts';
import {TELEMETRY_RATES, TelemetrySummaryMetric} from './telemetry-summary';

/** Core seriesOf must honor missing:'absent' before these quantities enter correlations. */
export function telemetryDailyMetrics(
  metrics: TelemetrySummaryMetric[],
): (DailyMetric & {missing: 'absent'})[] {
  return metrics.map(metric => ({
    key: `activity.telemetry.${metric.source}.${metric.name}`,
    module: 'activity',
    labelKey: `activity.telemetry.${metric.source}.${metric.name}`,
    unit: metric.unit,
    missing: 'absent',
    days: metric.days,
  }));
}

export function telemetryLifeCards(
  metrics: TelemetrySummaryMetric[],
): LifeCard[] {
  return metrics.map(metric => ({
    module: 'activity',
    icon: 'analytics',
    key: `activity.telemetry.${metric.source}.${metric.name}`,
    value: metric.value,
    format: metric.unit === 'hours' ? 'hours' : 'number',
    aggregate: metric.name in TELEMETRY_RATES ? 'average' : 'sum',
    detailKey: 'activity.telemetry.observations',
  }));
}

export function telemetryLifeEvents(
  metrics: TelemetrySummaryMetric[],
): LifeEvent[] {
  return metrics.map(metric => ({
    module: 'activity',
    icon: 'analytics',
    key: `activity.telemetry.${metric.source}.${metric.name}Day`,
    params: {value: metric.value},
    at: null,
    link: '/activity/overview',
  }));
}
