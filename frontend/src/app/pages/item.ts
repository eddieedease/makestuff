import { NgComponentOutlet } from '@angular/common';
import { Component, HostListener, inject, input, OnDestroy, OnInit, signal, Type } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from '../core/api';
import { Auth, errorMessage } from '../core/auth';
import { learningType } from '../core/learning-types';
import { LearningObject, User } from '../core/models';
import { EmbedPanel } from './item-embed';
import { ResultsPanel } from './item-results';
import { TPipe, t } from '../i18n/i18n';

type Tab = 'content' | 'details' | 'embed' | 'results';
const AUTOSAVE_MS = 1200;

@Component({
  imports: [FormsModule, RouterLink, NgComponentOutlet, EmbedPanel, ResultsPanel, TPipe],
  template: `
    @if (object(); as o) {
      <div class="border-b border-line bg-surface px-4 pt-4 md:px-8">
        <a routerLink="/library" class="text-sm text-muted hover:text-ink">{{ '← Library' | t }}</a>
        <div class="mt-2 flex flex-wrap items-center gap-3">
          <input
            class="font-display min-w-0 flex-1 basis-64 rounded-lg bg-transparent px-1 text-2xl font-semibold focus:bg-paper focus:outline-none"
            [attr.aria-label]="'Title' | t"
            [(ngModel)]="title"
            (ngModelChange)="touch()"
          />
          <span class="text-xs text-muted" aria-live="polite">{{ saveLabel() }}</span>
          <button type="button" class="btn-ghost" (click)="preview()">{{ 'Preview' | t }}</button>
          @if (o.published_at) {
            <button type="button" class="btn-ghost" (click)="unpublish()">{{ 'Unpublish' | t }}</button>
          }
          <button type="button" class="btn-primary" [disabled]="!!o.published_at && !o.has_changes && !dirty()" (click)="publish()">
            {{ (!o.published_at ? 'Publish' : o.has_changes || dirty() ? 'Publish changes' : 'Published') | t }}
          </button>
        </div>
        <div class="mt-3 flex gap-1 overflow-x-auto" role="tablist">
          @for (tb of tabs; track tb.key) {
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="tab() === tb.key"
              class="whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium"
              [class]="tab() === tb.key ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'"
              (click)="tab.set(tb.key)"
            >{{ tb.label | t }}</button>
          }
        </div>
      </div>

      <div class="px-4 py-6 md:px-8">
        @if (error()) {
          <p class="alert-error mb-4" role="alert">{{ error() }}</p>
        }
        @if (problems().length) {
          <div class="alert-error mb-4" role="alert">
            <p class="font-semibold">{{ 'Fix these before publishing:' | t }}</p>
            <ul class="mt-1 list-disc pl-5">
              @for (p of problems(); track p) {
                <li>{{ p }}</li>
              }
            </ul>
          </div>
        }
        @if (notice()) {
          <p class="alert-ok mb-4" role="status">{{ notice() }}</p>
        }

        @switch (tab()) {
          @case ('content') {
            @if (editor(); as component) {
              <ng-container *ngComponentOutlet="component; inputs: { content: o.content, changed: changed }" />
            }
          }
          @case ('details') {
            <div class="max-w-xl space-y-4">
              <label class="label">{{ 'Description' | t }}
                <textarea class="input" rows="3" [(ngModel)]="description" (ngModelChange)="touch()"></textarea>
                <span class="hint">{{ 'Shown to teachers when they pick this item from their LMS.' | t }}</span>
              </label>
              @if (auth.isAdmin()) {
                <label class="label">{{ 'Owner' | t }}
                  <select class="input" [ngModel]="o.owner.id" (ngModelChange)="assign($event)">
                    @for (u of users(); track u.id) {
                      <option [ngValue]="u.id">{{ u.name }} ({{ u.username }})</option>
                    }
                  </select>
                  <span class="hint">{{ 'The owner can edit this item and see its results.' | t }}</span>
                </label>
              } @else {
                <p class="text-sm text-muted">{{ 'Owner: {name}' | t: { name: o.owner.name } }}</p>
              }
            </div>
          }
          @case ('embed') {
            <app-embed-panel [objectId]="o.id" [published]="!!o.published_at" />
          }
          @case ('results') {
            <app-results-panel [objectId]="o.id" />
          }
        }
      </div>
    } @else if (error()) {
      <div class="px-8 py-8">
        <p class="alert-error" role="alert">{{ error() }}</p>
        <a class="btn-ghost mt-4" routerLink="/library">{{ 'Back to the library' | t }}</a>
      </div>
    } @else {
      <p class="px-8 py-8 text-sm text-muted">{{ 'Loading…' | t }}</p>
    }
  `,
})
export class Item implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  auth = inject(Auth);

  id = input.required<string>();
  object = signal<LearningObject | null>(null);
  editor = signal<Type<unknown> | null>(null);
  users = signal<User[]>([]);
  tab = signal<Tab>('content');
  dirty = signal(false);
  saving = signal(false);
  error = signal('');
  notice = signal('');
  problems = signal<string[]>([]);
  title = '';
  description = '';

  tabs: { key: Tab; label: string }[] = [
    { key: 'content', label: 'Content' },
    { key: 'details', label: 'Details' },
    { key: 'embed', label: 'Embed in LMS' },
    { key: 'results', label: 'Results' },
  ];

  private timer?: ReturnType<typeof setTimeout>;
  changed = () => this.touch();

  async ngOnInit(): Promise<void> {
    try {
      const object = await this.api.object(Number(this.id()));
      this.title = object.title;
      this.description = object.description;
      this.editor.set((await learningType(object.type)?.editor()) ?? null);
      this.object.set(object);
      if (this.auth.isAdmin()) this.users.set(await this.api.users());
    } catch (e) {
      this.error.set(e instanceof HttpErrorResponse && e.status === 404 ? t('This item does not exist, or it is not yours.') : errorMessage(e));
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    if (this.dirty()) this.save();
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeLeaving(event: BeforeUnloadEvent): void {
    if (this.dirty()) event.preventDefault();
  }

  saveLabel(): string {
    if (this.saving()) return t('Saving…');
    return t(this.dirty() ? 'Unsaved changes' : 'All changes saved');
  }

  touch(): void {
    this.dirty.set(true);
    this.notice.set('');
    this.problems.set([]);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), AUTOSAVE_MS);
  }

  async save(): Promise<boolean> {
    const object = this.object();
    if (!object) return false;
    clearTimeout(this.timer);
    this.saving.set(true);
    this.dirty.set(false);
    try {
      const saved = await this.api.saveObject(object.id, { title: this.title, description: this.description, content: object.content });
      // Keep the editor's content object: it may hold edits made during the request.
      this.object.update((current) => (current ? { ...saved, content: current.content } : current));
      this.error.set('');
      return true;
    } catch (e) {
      this.dirty.set(true);
      this.error.set(t('Not saved: {error}', { error: errorMessage(e) }));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async preview(): Promise<void> {
    const object = this.object();
    if (!object || !(await this.save())) return;
    const token = await this.api.preview(object.id);
    window.open(`play/${token}`, '_blank', 'noopener');
  }

  async publish(): Promise<void> {
    const object = this.object();
    if (!object || !(await this.save())) return;
    this.problems.set([]);
    try {
      const saved = await this.api.publish(object.id);
      this.object.update((current) => (current ? { ...saved, content: current.content } : current));
      this.notice.set(t('Published. Learners in an LMS now see this version.'));
    } catch (e) {
      const problems = e instanceof HttpErrorResponse ? e.error?.details?.problems : null;
      if (problems) this.problems.set(problems);
      else this.error.set(errorMessage(e));
    }
  }

  async unpublish(): Promise<void> {
    const object = this.object();
    if (!object || !confirm(t('Unpublish? LMS links to this item stop working until you publish again.'))) return;
    const saved = await this.api.unpublish(object.id);
    this.object.update((current) => (current ? { ...saved, content: current.content } : current));
  }

  async assign(ownerId: number): Promise<void> {
    const object = this.object();
    if (!object) return;
    try {
      const saved = await this.api.assign(object.id, ownerId);
      this.object.update((current) => (current ? { ...saved, content: current.content } : current));
      this.notice.set(t('This item now belongs to {name}.', { name: saved.owner.name }));
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
