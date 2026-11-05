import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { errorMessage } from '../core/auth';
import { t, TPipe } from '../i18n/i18n';
import { MapCanvas, MapEdge, MapNode } from '../shared/map-canvas';

const uid = (prefix: string) => prefix + crypto.randomUUID().slice(0, 8);
const GRID_X = 190;
const GRID_Y = 100;
const GRID_COLUMNS = 4;

@Component({
  imports: [FormsModule, MapCanvas, TPipe],
  template: `
    <div class="grid gap-4 xl:grid-cols-[1fr_24rem]">
      <div class="min-w-0 space-y-4">
        <app-map-canvas
          [nodes]="content().nodes"
          [edges]="content().edges"
          [categories]="content().categories"
          [selectedId]="selectedId()"
          [draggable]="true"
          (picked)="selectedId.set($event)"
          (moved)="changed()()"
        />
        <p class="hint">{{ 'Drag ideas to arrange them. Arrow keys work too.' | t }}</p>
        <button type="button" class="btn-ghost" (click)="add()">{{ 'Add idea' | t }}</button>

        <label class="label">{{ 'Introduction' | t }}
          <textarea class="input" rows="2" [(ngModel)]="content().intro" (ngModelChange)="touch()"></textarea>
        </label>

        <section class="grid gap-3 sm:grid-cols-2">
          <label class="label">{{ 'What learners see' | t }}
            <select class="input" [(ngModel)]="content().settings.reveal" (ngModelChange)="touch()">
              <option value="all">{{ 'The whole map from the start' | t }}</option>
              <option value="progressive">{{ 'One idea, revealing the rest as they explore' | t }}</option>
            </select>
          </label>
          <label class="label">{{ 'Attempts allowed' | t }}
            <input class="input" type="number" min="0" [(ngModel)]="content().settings.maxAttempts" (ngModelChange)="touch()" />
            <span class="hint">{{ '0 means unlimited.' | t }}</span>
          </label>
          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="mt-1 accent-accent" [(ngModel)]="content().settings.requireAll" (ngModelChange)="touch()" />
            <span>{{ 'Open every idea to finish' | t }}<span class="hint">{{ 'Otherwise learners can finish at any time.' | t }}</span></span>
          </label>
        </section>

        <section>
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ 'Categories' | t }}</h2>
          <p class="hint">{{ 'Optional. Ideas in a category share a colour.' | t }}</p>
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            @for (c of content().categories; track c.id; let i = $index) {
              <div class="flex gap-1">
                <input class="input" [attr.aria-label]="'Category {n}' | t: { n: i + 1 }" [(ngModel)]="c.name" (ngModelChange)="touch()" />
                <button type="button" class="btn-quiet !px-2" [attr.aria-label]="'Delete category {n}' | t: { n: i + 1 }" (click)="removeCategory(i)">✕</button>
              </div>
            }
          </div>
          <button type="button" class="btn-quiet mt-1 !px-2 !py-1" (click)="addCategory()">{{ 'Add category' | t }}</button>
        </section>
      </div>

      @if (selected(); as n) {
        <aside class="card space-y-3 self-start p-4">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="flex-1 text-lg font-semibold">{{ 'Idea' | t }}</h2>
            @if (content().settings.reveal === 'progressive') {
              @if (n.id === content().startId) {
                <span class="pill bg-accent-soft text-accent-dark">{{ 'Start' | t }}</span>
              } @else {
                <button type="button" class="btn-quiet !px-2 !py-1" (click)="makeStart(n)">{{ 'Make start' | t }}</button>
              }
            }
            <button type="button" class="btn-quiet !px-2 !py-1 hover:!text-danger" [disabled]="content().nodes.length === 1" (click)="remove(n)">{{ 'Delete' | t }}</button>
          </div>
          <label class="label">{{ 'Title' | t }}
            <input class="input" [(ngModel)]="n.title" (ngModelChange)="touch()" />
          </label>
          <label class="label">{{ 'Text' | t }}
            <textarea class="input" rows="5" [(ngModel)]="n.text" (ngModelChange)="touch()"></textarea>
            <span class="hint">{{ 'Markdown works here.' | t }}</span>
          </label>
          <div>
            <label class="btn-ghost cursor-pointer !px-2.5 !py-1 !text-xs">
              {{ 'Image' | t }}
              <input type="file" class="sr-only" accept="image/png,image/jpeg,image/gif,image/webp" (change)="pickImage($event, n)" />
            </label>
            @if (uploadError()) { <span class="ml-2 text-xs text-danger">{{ uploadError() }}</span> }
          </div>
          @if (content().categories.length) {
            <label class="label">{{ 'Category' | t }}
              <select class="input" [(ngModel)]="n.categoryId" (ngModelChange)="touch()">
                <option value="">{{ 'None' | t }}</option>
                @for (c of content().categories; track c.id) {
                  <option [value]="c.id">{{ c.name || ('Unnamed' | t) }}</option>
                }
              </select>
            </label>
          }

          <h3 class="pt-1 font-sans text-sm font-semibold">{{ 'Connections' | t }}</h3>
          @for (e of connections(n.id); track e.id) {
            <div class="space-y-1.5 rounded-lg bg-paper p-2.5">
              <div class="flex items-center gap-1 text-sm">
                <span class="min-w-0 flex-1 truncate font-medium">{{ e.from === n.id ? '→' : '←' }} {{ title(e.from === n.id ? e.to : e.from) }}</span>
                <button type="button" class="btn-quiet !px-2 !py-1" [attr.aria-label]="'Swap direction' | t" (click)="swap(e)">⇄</button>
                <button type="button" class="btn-quiet !px-2 !py-1" [attr.aria-label]="'Delete connection' | t" (click)="removeEdge(e)">✕</button>
              </div>
              <input class="input" [attr.aria-label]="'Label' | t" [placeholder]="'For example: leads to' | t" [(ngModel)]="e.label" (ngModelChange)="touch()" />
            </div>
          }
          <select class="input" [attr.aria-label]="'Connect to' | t" [ngModel]="''" (ngModelChange)="connect(n, $event)">
            <option value="">{{ 'Connect to…' | t }}</option>
            @for (o of unconnected(n.id); track o.id) {
              <option [value]="o.id">{{ o.title || ('Untitled' | t) }}</option>
            }
          </select>
        </aside>
      }
    </div>
  `,
})
export class ConceptMapEditor implements OnInit {
  private api = inject(Api);
  content = input.required<any>();
  changed = input.required<() => void>();
  selectedId = signal('');
  uploadError = signal('');
  private version = signal(0);

  selected = computed<MapNode | null>(() => {
    this.version();
    return this.content().nodes.find((n: MapNode) => n.id === this.selectedId()) ?? null;
  });

  ngOnInit(): void {
    this.selectedId.set(this.content().startId || this.content().nodes[0]?.id || '');
  }

  touch(): void {
    this.version.update((v) => v + 1);
    this.changed()();
  }

  title(id: string): string {
    return this.content().nodes.find((n: MapNode) => n.id === id)?.title || t('Untitled');
  }

  connections(id: string): MapEdge[] {
    return this.content().edges.filter((e: MapEdge) => e.from === id || e.to === id);
  }

  unconnected(id: string): MapNode[] {
    const linked = new Set(this.connections(id).flatMap((e) => [e.from, e.to]));
    return this.content().nodes.filter((n: MapNode) => n.id !== id && !linked.has(n.id));
  }

  /** First free spot on a loose grid, so a new idea never lands on another. */
  private freeSpot(): { x: number; y: number } {
    const nodes: MapNode[] = this.content().nodes;
    for (let i = 0; ; i++) {
      const x = 40 + (i % GRID_COLUMNS) * GRID_X;
      const y = 40 + Math.floor(i / GRID_COLUMNS) * GRID_Y;
      if (!nodes.some((n) => Math.abs(n.x - x) < GRID_X * 0.9 && Math.abs(n.y - y) < GRID_Y * 0.8)) return { x, y };
    }
  }

  add(): void {
    const node: MapNode = { id: uid('n'), title: t('New idea'), text: '', categoryId: '', ...this.freeSpot() };
    this.content().nodes.push(node);
    this.selectedId.set(node.id);
    this.touch();
  }

  remove(node: MapNode): void {
    const title = node.title || t('Untitled');
    if (!confirm(t('Delete "{title}"?', { title }))) return;
    const content = this.content();
    content.nodes = content.nodes.filter((n: MapNode) => n !== node);
    content.edges = content.edges.filter((e: MapEdge) => e.from !== node.id && e.to !== node.id);
    if (content.startId === node.id) content.startId = content.nodes[0]?.id ?? '';
    this.selectedId.set(content.nodes[0]?.id ?? '');
    this.touch();
  }

  makeStart(node: MapNode): void {
    this.content().startId = node.id;
    this.touch();
  }

  connect(node: MapNode, targetId: string): void {
    if (!targetId) return;
    this.content().edges.push({ id: uid('e'), from: node.id, to: targetId, label: '' });
    this.touch();
  }

  swap(edge: MapEdge): void {
    [edge.from, edge.to] = [edge.to, edge.from];
    this.touch();
  }

  removeEdge(edge: MapEdge): void {
    this.content().edges = this.content().edges.filter((e: MapEdge) => e !== edge);
    this.touch();
  }

  addCategory(): void {
    this.content().categories.push({ id: uid('c'), name: '' });
    this.touch();
  }

  removeCategory(index: number): void {
    const [category] = this.content().categories.splice(index, 1);
    for (const node of this.content().nodes as MapNode[]) {
      if (node.categoryId === category.id) node.categoryId = '';
    }
    this.touch();
  }

  async pickImage(event: Event, node: MapNode): Promise<void> {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = '';
    if (!file) return;
    this.uploadError.set('');
    try {
      const result = await this.api.upload(file);
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
      node.text = `${node.text}\n\n![${alt}](${result.url})\n`.trimStart();
      this.touch();
    } catch (e) {
      this.uploadError.set(errorMessage(e));
    }
  }
}
