import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/** Markdown to sanitized HTML. Author content runs inside other people's LMSs, so it is always purified. */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(text: string | null | undefined): SafeHtml {
    const html = marked.parse(text ?? '', { async: false, gfm: true, breaks: false });
    return this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(html));
  }
}
