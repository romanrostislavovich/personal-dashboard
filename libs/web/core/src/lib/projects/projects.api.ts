import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Project, ProjectInput } from '@pd/contracts';

/** Проекты доступны всем модулям: например, финансы используют их как «кошельки». */
@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly http = inject(HttpClient);

  /** Реактивный список; вызывать в поле компонента, обновлять через `.reload()`. */
  list() {
    return httpResource<Project[]>(() => '/api/projects', { defaultValue: [] });
  }

  create(input: ProjectInput) {
    return this.http.post<Project>('/api/projects', input);
  }

  update(id: string, input: ProjectInput) {
    return this.http.put<Project>(`/api/projects/${id}`, input);
  }

  remove(id: string) {
    return this.http.delete<void>(`/api/projects/${id}`);
  }
}
