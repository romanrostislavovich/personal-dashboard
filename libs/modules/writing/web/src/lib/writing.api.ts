import {httpResource} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {WRITING_READS, writingApi} from '@pd/client-core';
import {
  WritingCheck,
  WritingConfig,
  WritingIgnore,
  WritingRewriteInput,
  WritingSettingsUpdate,
} from '@pd/contracts';
import {DASHBOARD_CLIENT, fromCore} from '@pd/web-core';

/** The writing requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({providedIn: 'root'})
export class WritingApi {
  private readonly writing = writingApi(inject(DASHBOARD_CLIENT).api);

  settings() {
    return httpResource<WritingConfig>(() => WRITING_READS.settings());
  }

  saveSettings(update: WritingSettingsUpdate) {
    return fromCore(() => this.writing.saveSettings(update));
  }

  ignore(what: WritingIgnore) {
    return fromCore(() => this.writing.ignore(what));
  }

  check(input: WritingCheck) {
    return fromCore(() => this.writing.check(input));
  }

  rewrite(input: WritingRewriteInput) {
    return fromCore(() => this.writing.rewrite(input));
  }

  /** The owner sets the server's LanguageTool. */
  setLanguageTool(url: string) {
    return fromCore(() => this.writing.setLanguageTool({url}));
  }

  removeLanguageTool() {
    return fromCore(() => this.writing.removeLanguageTool());
  }
}
