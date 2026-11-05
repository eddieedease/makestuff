import { Component, ElementRef, inject, input, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { errorMessage } from '../core/auth';
import { Segment } from '../core/models';
import { Segments } from '../shared/segments';

const SNIPPETS: { label: string; text: string }[] = [
  { label: 'Question', text: '\n:::question\nYour question?\n- [ ] Wrong answer :: Feedback for this option\n- [x] Right answer\n> Feedback shown after answering\n:::\n' },
  { label: 'Reveal', text: '\n:::reveal Click to show\nHidden content.\n:::\n' },
  { label: 'Callout', text: '\n:::callout tip\nSomething worth remembering.\n:::\n' },
  { label: 'Flip cards', text: '\n:::flipcards\nTerm | Explanation\nAnother term | Another explanation\n:::\n' },
];

@Component({
  imports: [FormsModule, Segments],
  template: `
    <div class="grid gap-4 xl:grid-cols-[13rem_1fr]">
      <aside>
        <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">Pages</h2>
        <ol class="mt-2 space-y-1">
          @for (page of content().pages; track page.id; let i = $index) {
            <li>
              <button
                type="button"
                class="w-full truncate rounded-lg px-3 py-2 text-left text-sm"
                [class]="i === index() ? 'bg-accent-soft font-medium text-accent-dark' : 'text-muted hover:bg-line/50'"
                (click)="select(i)"
              >{{ i + 1 }}. {{ page.title || 'Untitled' }}</button>
            </li>
          }
        </ol>
        <button type="button" class="btn-ghost mt-2 w-full" (click)="addPage()">Add page</button>
        <label class="label mt-6">Grading
          <select class="input" [(ngModel)]="content().settings.grading" (ngModelChange)="changed()()">
            <option value="completion">Completing it counts as 100%</option>
            <option value="questions">Score from the questions</option>
          </select>
        </label>
        @if (content().settings.grading === 'questions') {
          <label class="label mt-3">Pass mark (%)
            <input class="input" type="number" min="0" max="100" [(ngModel)]="content().settings.passPercentage" (ngModelChange)="changed()()" />
          </label>
        }
      </aside>

      @if (page(); as p) {
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <input class="input !w-auto min-w-0 flex-1 basis-56 font-medium" aria-label="Page title" placeholder="Page title" [(ngModel)]="p.title" (ngModelChange)="changed()()" />
            <button type="button" class="btn-quiet !px-2" aria-label="Move page up" [disabled]="index() === 0" (click)="move(-1)">↑</button>
            <button type="button" class="btn-quiet !px-2" aria-label="Move page down" [disabled]="index() === content().pages.length - 1" (click)="move(1)">↓</button>
            <button type="button" class="btn-quiet hover:!text-danger" [disabled]="content().pages.length === 1" (click)="removePage()">Delete page</button>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-1">
            @for (s of snippets; track s.label) {
              <button type="button" class="btn-ghost !px-2.5 !py-1 !text-xs" (click)="insert(s.text)">{{ s.label }}</button>
            }
            <label class="btn-ghost !px-2.5 !py-1 !text-xs cursor-pointer">
              Image
              <input type="file" class="sr-only" accept="image/png,image/jpeg,image/gif,image/webp" (change)="pickImage($event)" />
            </label>
            @if (uploadError()) { <span class="text-xs text-danger">{{ uploadError() }}</span> }
          </div>

          <div class="mt-2 grid gap-4 lg:grid-cols-2">
            <textarea
              #editor
              class="input min-h-[32rem] resize-y font-mono !text-[13px] leading-relaxed"
              aria-label="Page content in Markdown"
              spellcheck="true"
              [(ngModel)]="p.markdown"
              (ngModelChange)="edited()"
              (drop)="dropImage($event)"
              (paste)="pasteImage($event)"
            ></textarea>
            <div class="card min-h-[32rem] min-w-0 overflow-auto p-5">
              <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Preview</p>
              <app-segments [segments]="segments()" [readonly]="true" />
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ElearningEditor implements OnInit, OnDestroy {
  private api = inject(Api);
  content = input.required<any>();
  changed = input.required<() => void>();
  editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');
  snippets = SNIPPETS;
  index = signal(0);
  segments = signal<Segment[]>([]);
  uploadError = signal('');
  private timer?: ReturnType<typeof setTimeout>;

  page = () => this.content().pages[this.index()];

  ngOnInit(): void {
    this.render();
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  select(index: number): void {
    this.index.set(index);
    this.render();
  }

  edited(): void {
    this.changed()();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render(), 300);
  }

  private async render(): Promise<void> {
    const markdown = this.page()?.markdown ?? '';
    const segments = await this.api.renderMarkdown(markdown);
    if ((this.page()?.markdown ?? '') === markdown) this.segments.set(segments);
  }

  addPage(): void {
    const pages = this.content().pages;
    pages.push({ id: 'p' + crypto.randomUUID().slice(0, 8), title: 'New page', markdown: '# New page\n\n' });
    this.select(pages.length - 1);
    this.changed()();
  }

  removePage(): void {
    const pages = this.content().pages;
    if (pages.length < 2 || !confirm(`Delete page "${this.page().title}"?`)) return;
    pages.splice(this.index(), 1);
    this.select(Math.min(this.index(), pages.length - 1));
    this.changed()();
  }

  move(delta: number): void {
    const pages = this.content().pages;
    const from = this.index();
    const [page] = pages.splice(from, 1);
    pages.splice(from + delta, 0, page);
    this.index.set(from + delta);
    this.changed()();
  }

  insert(text: string): void {
    const element = this.editor()?.nativeElement;
    const page = this.page();
    const start = element?.selectionStart ?? page.markdown.length;
    const end = element?.selectionEnd ?? start;
    page.markdown = page.markdown.slice(0, start) + text + page.markdown.slice(end);
    this.edited();
    queueMicrotask(() => {
      element?.focus();
      element?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  pickImage(event: Event): void {
    const field = event.target as HTMLInputElement;
    if (field.files?.[0]) this.upload(field.files[0]);
    field.value = '';
  }

  dropImage(event: DragEvent): void {
    const file = event.dataTransfer?.files[0];
    if (file?.type.startsWith('image/')) {
      event.preventDefault();
      this.upload(file);
    }
  }

  pasteImage(event: ClipboardEvent): void {
    const file = event.clipboardData?.files[0];
    if (file?.type.startsWith('image/')) {
      event.preventDefault();
      this.upload(file);
    }
  }

  private async upload(file: File): Promise<void> {
    this.uploadError.set('');
    try {
      const result = await this.api.upload(file);
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
      this.insert(`\n![${alt}](${result.url})\n`);
    } catch (e) {
      this.uploadError.set(errorMessage(e));
    }
  }
}
