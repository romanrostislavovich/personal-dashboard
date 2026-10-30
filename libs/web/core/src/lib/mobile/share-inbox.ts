import {Injectable} from '@angular/core';
import {SharedContent} from './share-target';

/** What was shared into the Android app, waiting for the capture page to take it. */
@Injectable({providedIn: 'root'})
export class ShareInbox {
  private content: SharedContent | null = null;

  put(content: SharedContent): void {
    this.content = content;
  }

  /** Taken once: going back to the page later shows nothing shared again. */
  take(): SharedContent | null {
    const content = this.content;
    this.content = null;
    return content;
  }
}
