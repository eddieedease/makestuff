import { Component, computed, input, output } from '@angular/core';
import { TPipe } from '../i18n/i18n';

export interface MapNode {
  id: string;
  title: string;
  text: string;
  categoryId: string;
  x: number;
  y: number;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface MapCategory {
  id: string;
  name: string;
}

const WIDTH = 150;
const HEIGHT = 52;
const PADDING = 24;
const MAX_POSITION = 1600;
const KEY_STEP = 10;
const DRAG_THRESHOLD = 4;
/** Colour per category position: background and text for filled nodes, dot for the legend. */
const PALETTE = [
  'bg-info-soft text-info',
  'bg-accent-soft text-accent-dark',
  'bg-warn-soft text-warn',
  'bg-danger-soft text-danger',
];

/** The graph itself, shared by the editor (draggable) and the player. */
@Component({
  selector: 'app-map-canvas',
  imports: [TPipe],
  template: `
    <div class="overflow-auto rounded-xl border border-line bg-surface" role="group" [attr.aria-label]="'Map of the ideas' | t">
      <div class="relative touch-pan-x touch-pan-y" [style.width.px]="size().width" [style.height.px]="size().height">
        <svg class="pointer-events-none absolute inset-0" [attr.width]="size().width" [attr.height]="size().height" aria-hidden="true">
          <defs>
            <marker id="map-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" class="fill-muted" />
            </marker>
          </defs>
          @for (l of lines(); track l.id) {
            <line [attr.x1]="l.x1" [attr.y1]="l.y1" [attr.x2]="l.x2" [attr.y2]="l.y2" class="stroke-muted/60" stroke-width="1.5" marker-end="url(#map-arrow)" />
            @if (l.label) {
              <text [attr.x]="l.mx" [attr.y]="l.my" text-anchor="middle" dominant-baseline="middle" class="fill-muted stroke-surface text-[11px]" stroke-width="4" paint-order="stroke">{{ l.label }}</text>
            }
          }
        </svg>
        @for (n of shown(); track n.id) {
          <button
            type="button"
            class="absolute flex items-center justify-center rounded-lg border px-2 text-center text-xs font-semibold leading-tight transition-colors"
            [class]="boxClass(n)"
            [class.cursor-move]="draggable()"
            [style.left.px]="n.x"
            [style.top.px]="n.y"
            [style.width.px]="width"
            [style.height.px]="height"
            [attr.aria-pressed]="selectedId() === n.id"
            (pointerdown)="startDrag($event, n)"
            (pointermove)="drag($event, n)"
            (pointerup)="endDrag()"
            (keydown)="nudge($event, n)"
            (click)="picked.emit(n.id)"
          >
            <span class="line-clamp-2">{{ n.title || ('Untitled' | t) }}</span>
          </button>
        }
      </div>
    </div>
    @if (categories().length) {
      <ul class="mt-2 flex flex-wrap gap-2 text-xs" [attr.aria-label]="'Categories' | t">
        @for (c of categories(); track c.id; let i = $index) {
          <li class="pill" [class]="color(i)">{{ c.name || ('Unnamed' | t) }}</li>
        }
      </ul>
    }
  `,
})
export class MapCanvas {
  nodes = input.required<MapNode[]>();
  edges = input.required<MapEdge[]>();
  categories = input<MapCategory[]>([]);
  selectedId = input('');
  /** Nodes to show; null shows them all. */
  visible = input<Set<string> | null>(null);
  /** Opened nodes are filled in; null fills them all. */
  visited = input<Set<string> | null>(null);
  draggable = input(false);
  picked = output<string>();
  moved = output<void>();

  width = WIDTH;
  height = HEIGHT;
  private dragging: { pointerX: number; pointerY: number; x: number; y: number; started: boolean } | null = null;

  // These read node positions that change in place while dragging, so they are
  // plain methods, recalculated each time the template renders.
  shown = (): MapNode[] => {
    const visible = this.visible();
    return visible ? this.nodes().filter((n) => visible.has(n.id)) : this.nodes();
  };

  size = () => {
    const shown = this.nodes();
    return {
      width: Math.max(...shown.map((n) => n.x), 0) + WIDTH + PADDING,
      height: Math.max(...shown.map((n) => n.y), 0) + HEIGHT + PADDING,
    };
  };

  lines = () => {
    const byId = new Map(this.shown().map((n) => [n.id, n]));
    const pairs = new Set(this.edges().map((e) => `${e.from}>${e.to}`));
    return this.edges().flatMap((edge) => {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      if (!a || !b) return [];
      const ax = a.x + WIDTH / 2;
      const ay = a.y + HEIGHT / 2;
      const dx = b.x + WIDTH / 2 - ax;
      const dy = b.y + HEIGHT / 2 - ay;
      const length = Math.hypot(dx, dy) || 1;
      // Stop at the edge of each box, so the arrowhead stays visible.
      const clip = Math.min(WIDTH / 2 / Math.max(Math.abs(dx), 0.01), HEIGHT / 2 / Math.max(Math.abs(dy), 0.01));
      // Two opposite connections run side by side instead of on top of each other.
      const shift = pairs.has(`${edge.to}>${edge.from}`) ? 6 : 0;
      const ox = (-dy / length) * shift;
      const oy = (dx / length) * shift;
      const gap = 3 / length;
      return [{
        id: edge.id,
        label: edge.label,
        x1: ax + dx * clip + ox,
        y1: ay + dy * clip + oy,
        x2: ax + dx * (1 - clip - gap) + ox,
        y2: ay + dy * (1 - clip - gap) + oy,
        mx: ax + dx / 2 + ox * 2.5,
        my: ay + dy / 2 + oy * 2.5,
      }];
    });
  };

  private index = computed(() => new Map(this.categories().map((c, i) => [c.id, i])));

  color(index: number): string {
    return PALETTE[index % PALETTE.length];
  }

  boxClass(node: MapNode): string {
    const selected = this.selectedId() === node.id ? ' ring-2 ring-accent ring-offset-1' : '';
    const visited = this.visited();
    if (visited && !visited.has(node.id)) return 'border-dashed border-line-strong bg-surface text-muted hover:border-accent' + selected;
    const category = this.index().get(node.categoryId);
    const fill = category === undefined ? 'bg-paper text-ink' : this.color(category);
    return `border-transparent ${fill}` + selected;
  }

  startDrag(event: PointerEvent, node: MapNode): void {
    if (!this.draggable()) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = { pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y, started: false };
  }

  drag(event: PointerEvent, node: MapNode): void {
    const state = this.dragging;
    if (!state) return;
    const dx = event.clientX - state.pointerX;
    const dy = event.clientY - state.pointerY;
    if (!state.started && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    state.started = true;
    this.place(node, state.x + dx, state.y + dy);
  }

  endDrag(): void {
    this.dragging = null;
  }

  /** Arrow keys do what dragging does, for people who do not use a mouse. */
  nudge(event: KeyboardEvent, node: MapNode): void {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const delta = step[event.key];
    if (!this.draggable() || !delta) return;
    event.preventDefault();
    this.place(node, node.x + delta[0], node.y + delta[1]);
  }

  private place(node: MapNode, x: number, y: number): void {
    node.x = Math.round(Math.min(MAX_POSITION, Math.max(0, x)));
    node.y = Math.round(Math.min(MAX_POSITION, Math.max(0, y)));
    this.moved.emit();
  }
}
