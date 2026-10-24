const STRUCTURED = [
  /^\s*([-*+•]|\d+[.)])\s/, // list items
  /^(\s{2,}|\t)/, // indented code
  /^[A-Z][\w-]*: \S/, // trailers such as "Signed-off-by: …"
];

/**
 * Splits a commit body into paragraphs, joining lines that were hard-wrapped
 * at ~72 columns so they reflow to the panel width. Paragraphs that look
 * structured (lists, indented code, trailers) keep their line breaks.
 */
export function reflowParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+$/, ''))
    .filter((paragraph) => paragraph.trim() !== '')
    .map((paragraph) => {
      const lines = paragraph.split('\n');
      const structured = lines.some((line) => STRUCTURED.some((pattern) => pattern.test(line)));
      return structured ? paragraph : lines.map((line) => line.trim()).join(' ');
    });
}
