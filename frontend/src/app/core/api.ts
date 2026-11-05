import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Attempt, Connection, EmbedInfo, LearningObject, Segment, User } from './models';

/** Authoring API. Everything returns promises: these are one-shot calls. */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  private get<T>(url: string, params?: Record<string, string>): Promise<T> {
    return firstValueFrom(this.http.get<T>(url, { params }));
  }
  private post<T>(url: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(url, body));
  }
  private put<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(url, body));
  }
  private del(url: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(url));
  }

  objects = (params: Record<string, string>) => this.get<{ objects: LearningObject[] }>('api/objects', params).then((r) => r.objects);
  object = (id: number) => this.get<{ object: LearningObject }>(`api/objects/${id}`).then((r) => r.object);
  createObject = (type: string, title: string) => this.post<{ object: LearningObject }>('api/objects', { type, title }).then((r) => r.object);
  saveObject = (id: number, body: { title: string; description: string; content: unknown }) =>
    this.put<{ object: LearningObject }>(`api/objects/${id}`, body).then((r) => r.object);
  deleteObject = (id: number) => this.del(`api/objects/${id}`);
  publish = (id: number) => this.post<{ object: LearningObject }>(`api/objects/${id}/publish`).then((r) => r.object);
  unpublish = (id: number) => this.post<{ object: LearningObject }>(`api/objects/${id}/unpublish`).then((r) => r.object);
  duplicate = (id: number) => this.post<{ object: LearningObject }>(`api/objects/${id}/duplicate`).then((r) => r.object);
  preview = (id: number) => this.post<{ token: string }>(`api/objects/${id}/preview`).then((r) => r.token);
  assign = (id: number, ownerId: number) => this.post<{ object: LearningObject }>(`api/objects/${id}/owner`, { owner_id: ownerId }).then((r) => r.object);
  results = (id: number) => this.get<{ attempts: Attempt[] }>(`api/objects/${id}/results`).then((r) => r.attempts);
  embed = (id: number) => this.get<EmbedInfo>(`api/objects/${id}/embed`);
  renderMarkdown = (markdown: string) => this.post<{ segments: Segment[] }>('api/render/markdown', { markdown }).then((r) => r.segments);

  upload(file: File): Promise<{ url: string; name: string }> {
    const body = new FormData();
    body.append('file', file);
    return this.post('api/media', body);
  }

  users = () => this.get<{ users: User[] }>('api/users').then((r) => r.users);
  createUser = (body: object) => this.post('api/users', body);
  updateUser = (id: number, body: object) => this.put(`api/users/${id}`, body);
  deleteUser = (id: number) => this.del(`api/users/${id}`);

  connections = () => this.get<{ connections: Connection[] }>('api/connections').then((r) => r.connections);
  createConnection = (body: object) => this.post<{ connection: Connection }>('api/connections', body).then((r) => r.connection);
  updateConnection = (id: number, body: object) => this.put<{ connection: Connection }>(`api/connections/${id}`, body).then((r) => r.connection);
  deleteConnection = (id: number) => this.del(`api/connections/${id}`);

  updateAccount = (body: object) => this.put<{ user: User }>('api/auth/me', body).then((r) => r.user);
  forgot = (email: string) => this.post('api/auth/forgot', { email });
  reset = (token: string, password: string) => this.post('api/auth/reset', { token, password });
}
