import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { EmbedInfo } from '../core/models';
import { TPipe } from '../i18n/i18n';

@Component({
  imports: [TPipe],
  selector: 'app-copy-row',
  template: `
    <div class="py-2">
      <p class="text-xs font-medium text-muted">{{ label() }}</p>
      <div class="mt-1 flex items-center gap-2">
        <code class="min-w-0 flex-1 truncate rounded-md bg-paper px-2 py-1.5 text-xs">{{ value() }}</code>
        <button type="button" class="btn-quiet !px-2 !py-1" (click)="copy()">{{ (copied() ? 'Copied' : 'Copy') | t }}</button>
      </div>
    </div>
  `,
})
export class CopyRow {
  label = input.required<string>();
  value = input.required<string>();
  copied = signal(false);

  async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.value());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }
}

@Component({
  selector: 'app-embed-panel',
  imports: [CopyRow, RouterLink, TPipe],
  template: `
    @if (!published()) {
      <p class="alert-error mb-4 max-w-3xl">{{ 'This item is a draft. Publish it first, or LMS launches will be refused.' | t }}</p>
    }
    @if (info(); as i) {
      <div class="grid max-w-5xl gap-4 lg:grid-cols-2">
        <section class="card p-5">
          <h2 class="text-lg font-semibold">LTI 1.3</h2>
          <p class="mt-1 text-sm text-muted">{{ 'For Moodle 4, Canvas, Brightspace and other current systems. Teachers can also pick this item from inside the LMS through deep linking.' | t }}</p>
          <div class="mt-2 divide-y divide-line">
            <app-copy-row [label]="'Target link URI' | t" [value]="i.lti13.target_link_uri" />
            <app-copy-row [label]="'Custom parameters' | t" [value]="i.lti13.custom_parameters" />
          </div>
        </section>
        <section class="card p-5">
          <h2 class="text-lg font-semibold">LTI 1.1</h2>
          <p class="mt-1 text-sm text-muted">{{ 'For older systems. Enter this URL with the consumer key and secret of your connection.' | t }}</p>
          <div class="mt-2"><app-copy-row [label]="'Launch URL' | t" [value]="i.lti11.launch_url" /></div>
        </section>
        <section class="card p-5 lg:col-span-2">
          <h2 class="text-lg font-semibold">{{ 'Tool registration' | t }}</h2>
          <p class="mt-1 text-sm text-muted">{{ 'The LMS administrator enters these once, for the whole platform.' | t }}</p>
          <div class="mt-2 grid gap-x-6 md:grid-cols-2">
            <app-copy-row [label]="'Login URL' | t" [value]="i.tool.login_url" />
            <app-copy-row [label]="'Redirect URL' | t" [value]="i.tool.redirect_url" />
            <app-copy-row [label]="'Public keyset (JWKS) URL' | t" [value]="i.tool.jwks_url" />
            <app-copy-row [label]="'Deep linking URL' | t" [value]="i.tool.deep_linking_url" />
          </div>
          <p class="mt-3 text-sm text-muted">
            @if (i.connections.length) {
              {{ 'Connected: {names}.' | t: { names: connectionNames() } }}
            } @else {
              {{ 'No LMS is connected yet.' | t }}
            }
            @if (auth.isAdmin()) {
              <a routerLink="/connections" class="underline">{{ 'Manage connections' | t }}</a>
            } @else {
              {{ 'Ask an administrator for keys.' | t }}
            }
          </p>
        </section>
      </div>
    }
  `,
})
export class EmbedPanel implements OnInit {
  private api = inject(Api);
  auth = inject(Auth);
  objectId = input.required<number>();
  published = input(false);
  info = signal<EmbedInfo | null>(null);

  async ngOnInit(): Promise<void> {
    this.info.set(await this.api.embed(this.objectId()));
  }

  connectionNames(): string {
    return (this.info()?.connections ?? []).map((c) => c.name).join(', ');
  }
}
