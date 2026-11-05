import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { errorMessage } from '../core/auth';
import { t, TPipe } from '../i18n/i18n';
import { layoutTree, NODE_HEIGHT, NODE_WIDTH, TreeNode } from './tree-layout';

const uid = (prefix: string) => prefix + crypto.randomUUID().slice(0, 8);
const NEW_STEP = '__new_step';
const NEW_END = '__new_end';

@Component({
  imports: [FormsModule, TPipe],
  template: `
    <div class="grid gap-4 xl:grid-cols-[1fr_24rem]">
      <div class="min-w-0 space-y-4">
        <section class="card overflow-auto" [attr.aria-label]="'Map of the scenario' | t">
          <div class="relative" [style.width.px]="layout().width" [style.height.px]="layout().height">
            <svg class="pointer-events-none absolute inset-0" [attr.width]="layout().width" [attr.height]="layout().height" aria-hidden="true">
              <defs>
                <marker id="tree-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 8 4 L 0 8 z" class="fill-line-strong" />
                </marker>
              </defs>
              @for (e of layout().edges; track e.key) {
                <path [attr.d]="e.path" fill="none" class="stroke-line-strong" stroke-width="1.5" [attr.stroke-dasharray]="e.back ? '5 4' : null" marker-end="url(#tree-arrow)"><title>{{ e.label }}</title></path>
              }
            </svg>
            @for (p of layout().placed; track p.node.id) {
              <button
                type="button"
                class="absolute rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors"
                [class]="boxClass(p.node, p.detached)"
                [style.left.px]="p.x"
                [style.top.px]="p.y"
                [style.width.px]="nodeWidth"
                [style.height.px]="nodeHeight"
                [attr.aria-pressed]="selectedId() === p.node.id"
                (click)="selectedId.set(p.node.id)"
              >
                <span class="block text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  {{ (p.node.id === content().startId ? 'Start' : p.node.kind === 'end' ? 'Ending' : 'Step') | t }}
                  @if (needsWork(p.node)) { <span class="text-danger">· {{ 'Unfinished' | t }}</span> }
                </span>
                <span class="line-clamp-2 font-medium">{{ p.node.title || ('Untitled' | t) }}</span>
              </button>
            }
          </div>
        </section>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-ghost" (click)="add('step')">{{ 'Add step' | t }}</button>
          <button type="button" class="btn-ghost" (click)="add('end')">{{ 'Add ending' | t }}</button>
        </div>

        <section class="grid gap-3 sm:grid-cols-2">
          <label class="label">{{ 'Grading' | t }}
            <select class="input" [(ngModel)]="content().settings.grading" (ngModelChange)="touch()">
              <option value="completion">{{ 'Reaching any ending counts as 100%' | t }}</option>
              <option value="ending">{{ 'Score from the ending reached' | t }}</option>
            </select>
          </label>
          @if (content().settings.grading === 'ending') {
            <label class="label">{{ 'Pass mark (%)' | t }}
              <input class="input" type="number" min="0" max="100" [(ngModel)]="content().settings.passPercentage" (ngModelChange)="touch()" />
            </label>
          }
          <label class="label">{{ 'Attempts allowed' | t }}
            <input class="input" type="number" min="0" [(ngModel)]="content().settings.maxAttempts" (ngModelChange)="touch()" />
            <span class="hint">{{ '0 means unlimited. The LMS gets the best score.' | t }}</span>
          </label>
          <label class="flex items-start gap-2 self-center text-sm">
            <input type="checkbox" class="mt-1 accent-accent" [(ngModel)]="content().settings.allowBack" (ngModelChange)="touch()" />
            <span>{{ 'Learners can go back' | t }}<span class="hint">{{ 'Turn off when a choice should be final.' | t }}</span></span>
          </label>
        </section>
      </div>

      @if (selected(); as n) {
        <aside class="card space-y-3 self-start p-4">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="flex-1 text-lg font-semibold">{{ (n.kind === 'end' ? 'Ending' : 'Step') | t }}</h2>
            @if (n.id !== content().startId && n.kind === 'step') {
              <button type="button" class="btn-quiet !px-2 !py-1" (click)="makeStart(n)">{{ 'Make start' | t }}</button>
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

          @if (n.kind === 'end') {
            <label class="label">{{ 'Score (%)' | t }}
              <input class="input" type="number" min="0" max="100" [(ngModel)]="n.score" (ngModelChange)="touch()" />
              @if (content().settings.grading !== 'ending') {
                <span class="hint">{{ 'Only used when grading uses the ending reached.' | t }}</span>
              }
            </label>
          } @else {
            <h3 class="pt-1 font-sans text-sm font-semibold">{{ 'Choices' | t }}</h3>
            @for (c of n.choices; track c.id; let i = $index) {
              <div class="space-y-1.5 rounded-lg bg-paper p-2.5">
                <div class="flex gap-1">
                  <input class="input" [attr.aria-label]="'Choice {n}' | t: { n: i + 1 }" [placeholder]="'What can the learner do?' | t" [(ngModel)]="c.text" (ngModelChange)="touch()" />
                  <button type="button" class="btn-quiet !px-2" [attr.aria-label]="'Delete choice {n}' | t: { n: i + 1 }" (click)="removeChoice(n, i)">✕</button>
                </div>
                <input class="input" [attr.aria-label]="'Feedback for choice {n}' | t: { n: i + 1 }" [placeholder]="'Feedback (optional)' | t" [(ngModel)]="c.feedback" (ngModelChange)="touch()" />
                <select class="input" [attr.aria-label]="'Leads to' | t" [ngModel]="c.targetId" (ngModelChange)="setTarget(c, $event)">
                  <option value="">{{ 'Leads to…' | t }}</option>
                  @for (o of targets(n); track o.id) {
                    <option [value]="o.id">{{ o.title || ('Untitled' | t) }}</option>
                  }
                  <option [value]="newStep">+ {{ 'New step' | t }}</option>
                  <option [value]="newEnd">+ {{ 'New ending' | t }}</option>
                </select>
              </div>
            }
            <button type="button" class="btn-ghost w-full" (click)="addChoice(n)">{{ 'Add choice' | t }}</button>
          }
        </aside>
      }
    </div>
  `,
})
export class DecisionTreeEditor implements OnInit {
  private api = inject(Api);
  content = input.required<any>();
  changed = input.required<() => void>();

  selectedId = signal('');
  uploadError = signal('');
  private version = signal(0);
  nodeWidth = NODE_WIDTH;
  nodeHeight = NODE_HEIGHT;
  newStep = NEW_STEP;
  newEnd = NEW_END;

  layout = computed(() => {
    this.version();
    return layoutTree(this.content().nodes, this.content().startId);
  });

  selected = computed<TreeNode | null>(() => {
    this.version();
    return this.content().nodes.find((n: TreeNode) => n.id === this.selectedId()) ?? null;
  });

  ngOnInit(): void {
    this.selectedId.set(this.content().startId);
  }

  touch(): void {
    this.version.update((v) => v + 1);
    this.changed()();
  }

  boxClass(node: TreeNode, detached: boolean): string {
    const selected = this.selectedId() === node.id ? ' ring-2 ring-accent' : '';
    if (detached) return 'border-dashed border-line-strong bg-paper text-muted' + selected;
    if (node.kind === 'end') return 'border-accent/40 bg-accent-soft text-accent-dark' + selected;
    return 'border-line-strong bg-surface hover:border-accent' + selected;
  }

  needsWork(node: TreeNode): boolean {
    if (!node.text?.trim()) return true;
    return node.kind === 'step' && (!node.choices.length || node.choices.some((c) => !c.targetId || !c.text.trim()));
  }

  targets(node: TreeNode): TreeNode[] {
    return this.content().nodes.filter((n: TreeNode) => n.id !== node.id);
  }

  private create(kind: 'step' | 'end'): TreeNode {
    const node: TreeNode = { id: uid('n'), kind, title: t(kind === 'end' ? 'New ending' : 'New step'), text: '', choices: [] };
    if (kind === 'end') node.score = 100;
    this.content().nodes.push(node);
    return node;
  }

  add(kind: 'step' | 'end'): void {
    this.selectedId.set(this.create(kind).id);
    this.touch();
  }

  addChoice(node: TreeNode): void {
    node.choices.push({ id: uid('c'), text: '', feedback: '', targetId: '' });
    this.touch();
  }

  removeChoice(node: TreeNode, index: number): void {
    node.choices.splice(index, 1);
    this.touch();
  }

  setTarget(choice: TreeNode['choices'][number], value: string): void {
    choice.targetId = value === NEW_STEP ? this.create('step').id : value === NEW_END ? this.create('end').id : value;
    this.touch();
  }

  makeStart(node: TreeNode): void {
    this.content().startId = node.id;
    this.touch();
  }

  remove(node: TreeNode): void {
    const title = node.title || t('Untitled');
    if (!confirm(t('Delete "{title}"?', { title }))) return;
    const content = this.content();
    content.nodes = content.nodes.filter((n: TreeNode) => n !== node);
    for (const other of content.nodes as TreeNode[]) {
      for (const choice of other.choices) {
        if (choice.targetId === node.id) choice.targetId = '';
      }
    }
    if (content.startId === node.id) content.startId = content.nodes.find((n: TreeNode) => n.kind === 'step')?.id ?? '';
    this.selectedId.set(content.startId);
    this.touch();
  }

  async pickImage(event: Event, node: TreeNode): Promise<void> {
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
