import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth, errorMessage } from '../core/auth';
import { LEARNING_TYPES, learningType, LearningTypeUi } from '../core/learning-types';
import { LearningObject, User } from '../core/models';

@Component({
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-3xl font-semibold">Library</h1>
          <p class="mt-1 text-sm text-muted">{{ auth.isAdmin() ? 'Everything on this platform.' : 'Everything you have made.' }}</p>
        </div>
        <button type="button" class="btn-primary" (click)="creating.set(!creating())">New item</button>
      </div>

      @if (creating()) {
        <section class="mt-5 grid gap-3 md:grid-cols-3" aria-label="Choose what to make">
          @for (type of types; track type.key) {
            <button type="button" class="card p-4 text-left transition-colors hover:border-accent" (click)="create(type)">
              <span class="pill" [class]="type.tag">{{ type.label }}</span>
              <span class="mt-2 block text-sm text-muted">{{ type.blurb }}</span>
            </button>
          }
        </section>
      }

      <div class="mt-6 flex flex-wrap gap-2">
        <input class="input !w-full sm:!w-64" type="search" placeholder="Search by title" aria-label="Search by title" [(ngModel)]="q" (ngModelChange)="load()" />
        <select class="input !w-auto" aria-label="Type" [(ngModel)]="type" (ngModelChange)="load()">
          <option value="">All types</option>
          @for (t of types; track t.key) {
            <option [value]="t.key">{{ t.label }}</option>
          }
        </select>
        @if (auth.isAdmin()) {
          <select class="input !w-auto" aria-label="Owner" [(ngModel)]="owner" (ngModelChange)="load()">
            <option value="">All owners</option>
            @for (u of users(); track u.id) {
              <option [value]="u.id">{{ u.name }}</option>
            }
          </select>
        }
      </div>

      @if (error()) {
        <p class="alert-error mt-4" role="alert">{{ error() }}</p>
      }

      <ul class="card mt-4 divide-y divide-line overflow-hidden">
        @for (item of items(); track item.id) {
          <li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-paper/60">
            <a class="min-w-0 flex-1 basis-64" [routerLink]="['/items', item.id]">
              <span class="block truncate font-medium">{{ item.title }}</span>
              <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span class="pill" [class]="tag(item.type)">{{ label(item.type) }}</span>
                @if (auth.isAdmin()) {
                  <span>{{ item.owner.name }}</span>
                }
                <span>Edited {{ item.updated_at + 'Z' | date: 'd MMM y' }}</span>
              </span>
            </a>
            @if (item.published_at) {
              <span class="pill bg-accent-soft text-accent-dark">{{ item.has_changes ? 'Published, with changes' : 'Published' }}</span>
            } @else {
              <span class="pill bg-line text-muted">Draft</span>
            }
            <div class="flex gap-1">
              <button type="button" class="btn-quiet !px-2 !py-1" (click)="duplicate(item)">Duplicate</button>
              <button type="button" class="btn-quiet !px-2 !py-1 hover:!text-danger" (click)="remove(item)">Delete</button>
            </div>
          </li>
        } @empty {
          <li class="px-4 py-12 text-center text-sm text-muted">
            {{ loading() ? 'Loading…' : q || type || owner ? 'Nothing matches those filters.' : 'Nothing here yet. Choose New item to make your first one.' }}
          </li>
        }
      </ul>
    </div>
  `,
})
export class Library implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  auth = inject(Auth);
  types = LEARNING_TYPES;
  items = signal<LearningObject[]>([]);
  users = signal<User[]>([]);
  loading = signal(true);
  creating = signal(false);
  error = signal('');
  q = '';
  type = '';
  owner = '';

  ngOnInit(): void {
    this.load();
    if (this.auth.isAdmin()) this.api.users().then((u) => this.users.set(u));
  }

  async load(): Promise<void> {
    try {
      this.items.set(await this.api.objects({ q: this.q, type: this.type, owner: this.owner }));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  label = (key: string) => learningType(key)?.label ?? key;
  tag = (key: string) => learningType(key)?.tag ?? 'bg-line text-muted';

  async create(type: LearningTypeUi): Promise<void> {
    try {
      const object = await this.api.createObject(type.key, `Untitled ${type.label.toLowerCase()}`);
      await this.router.navigate(['/items', object.id]);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  async duplicate(item: LearningObject): Promise<void> {
    await this.api.duplicate(item.id);
    await this.load();
  }

  async remove(item: LearningObject): Promise<void> {
    const warning = item.published_at ? ' It is published, so links from LMSs will stop working, and its results will be deleted.' : '';
    if (!confirm(`Delete "${item.title}"?${warning}`)) return;
    await this.api.deleteObject(item.id);
    await this.load();
  }
}
