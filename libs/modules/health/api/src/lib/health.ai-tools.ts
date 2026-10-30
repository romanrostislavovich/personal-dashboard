import {Injectable, OnModuleInit} from '@nestjs/common';
import {AiService, NO_PARAMETERS} from '@pd/api-core';
import {HealthService} from './health.service';

/**
 * The assistant's access to Health: reading the history. Health can be switched off for the AI
 * or given a connection of its own (a local model) in Settings → AI, like any section.
 */
@Injectable()
export class HealthAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly health: HealthService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'health_record',
      module: 'health',
      description:
        "The user's own medical history across countries and clinics: `visits` (visitedOn, " +
        'country, speciality, complaints, findings, recommendations, nextVisitOn, clinicId, ' +
        'doctorId), `diagnoses` (ICD system and code, the title as the document words it, ' +
        'status: suspected / confirmed / remission / resolved (recovered, taken off) / ruledOut (never there), diagnosedOn, visitId), ' +
        '`medications` (name, active substance, dose, schedule, startedOn, stoppedOn — null: ' +
        'still taken, stopReason), `labPanels` (lab reports: takenOn, laboratory and `values` — ' +
        "each line as written with its value, unit, the laboratory's own range refLow–refHigh, " +
        'flag low / high by that range and `canonical`, the value in one unit across ' +
        'laboratories), `studies` (ultrasound, MRI, ECG… with their conclusions), `clinics`, ' +
        '`doctors` and the `documents` kept (without their content). Useful for "how has my ' +
        'TSH changed", "what did the MRI show", "what did the psychiatrist prescribe", "when was I first ' +
        'diagnosed with X", "what do I take now". Tell the facts as recorded; never diagnose, ' +
        'never advise on treatment or doses — that is for a doctor.',
      parameters: NO_PARAMETERS,
      handler: userId => this.health.record(userId),
    });
  }
}
