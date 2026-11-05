import { Component, input } from '@angular/core';

@Component({
  selector: 'app-auth-layout',
  template: `
    <main class="flex min-h-dvh items-center justify-center px-4 py-10">
      <div class="w-full max-w-sm">
        <p class="font-display text-2xl font-semibold">Makestuff</p>
        <h1 class="mt-6 text-3xl font-semibold">{{ heading() }}</h1>
        <div class="mt-6"><ng-content /></div>
      </div>
    </main>
  `,
})
export class AuthLayout {
  heading = input.required<string>();
}
