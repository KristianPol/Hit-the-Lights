import sanitizeHtml from 'sanitize-html';

export class Sanitizer {
  static sanitizeText(input: string): string {
    return sanitizeHtml(input, {
      allowedTags: [],
      allowedAttributes: {},
      textFilter: (text: string) => text
    }).trim();
  }
}
