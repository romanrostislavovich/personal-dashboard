import {firstValueFrom, Observable} from 'rxjs';
import {photoIdFromSrc} from './diary-images';

/**
 * The editor's images of diary photos. A photo needs the auth header, so it is loaded as a blob
 * and shown through an object URL — once per photo while the editor lives; `revokeAll` frees
 * them when it closes. Any other image keeps its address.
 */
export class PhotoUrls {
  private readonly urls = new Map<string, Promise<string>>();

  constructor(private readonly blob: (id: string) => Observable<Blob>) {}

  load(src: string): Promise<string> {
    const id = photoIdFromSrc(src);
    if (!id) {
      return Promise.resolve(src);
    }
    let url = this.urls.get(src);
    if (!url) {
      url = firstValueFrom(this.blob(id)).then(blob =>
        URL.createObjectURL(blob),
      );
      this.urls.set(src, url);
    }
    return url;
  }

  revokeAll(): void {
    this.urls.forEach(
      url => void url.then(URL.revokeObjectURL, () => undefined),
    );
    this.urls.clear();
  }
}
