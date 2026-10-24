import { useEffect, useMemo, useState } from 'react';

type Highlighter = (code: string) => string;
type HljsApi = typeof import('highlight.js/lib/core').default;

let loading: Promise<HljsApi> | null = null;

/**
 * Loads highlight.js with a curated set of languages on first use, as a
 * separate chunk, so the initial bundle and start-up stay small.
 */
function loadHljs(): Promise<HljsApi> {
  loading ??= (async () => {
    const [{ default: hljs }, ...langs] = await Promise.all([
      import('highlight.js/lib/core'),
      import('highlight.js/lib/languages/typescript'),
      import('highlight.js/lib/languages/javascript'),
      import('highlight.js/lib/languages/json'),
      import('highlight.js/lib/languages/css'),
      import('highlight.js/lib/languages/scss'),
      import('highlight.js/lib/languages/less'),
      import('highlight.js/lib/languages/xml'),
      import('highlight.js/lib/languages/markdown'),
      import('highlight.js/lib/languages/rust'),
      import('highlight.js/lib/languages/python'),
      import('highlight.js/lib/languages/go'),
      import('highlight.js/lib/languages/java'),
      import('highlight.js/lib/languages/kotlin'),
      import('highlight.js/lib/languages/c'),
      import('highlight.js/lib/languages/cpp'),
      import('highlight.js/lib/languages/csharp'),
      import('highlight.js/lib/languages/php'),
      import('highlight.js/lib/languages/ruby'),
      import('highlight.js/lib/languages/bash'),
      import('highlight.js/lib/languages/yaml'),
      import('highlight.js/lib/languages/ini'),
      import('highlight.js/lib/languages/sql'),
      import('highlight.js/lib/languages/swift'),
      import('highlight.js/lib/languages/lua'),
      import('highlight.js/lib/languages/dart'),
      import('highlight.js/lib/languages/scala'),
      import('highlight.js/lib/languages/elixir'),
      import('highlight.js/lib/languages/dockerfile'),
      import('highlight.js/lib/languages/makefile'),
      import('highlight.js/lib/languages/cmake'),
      import('highlight.js/lib/languages/diff'),
    ]);
    const names = [
      'typescript', 'javascript', 'json', 'css', 'scss', 'less', 'xml', 'markdown', 'rust', 'python',
      'go', 'java', 'kotlin', 'c', 'cpp', 'csharp', 'php', 'ruby', 'bash', 'yaml', 'ini', 'sql',
      'swift', 'lua', 'dart', 'scala', 'elixir', 'dockerfile', 'makefile', 'cmake', 'diff',
    ];
    langs.forEach((lang, i) => {
      const name = names[i];
      if (name) hljs.registerLanguage(name, lang.default);
    });
    return hljs;
  })();
  return loading;
}

/**
 * A line highlighter for `language`, or null until highlight.js has loaded
 * (lines render as plain text in the meantime). Lines are highlighted one by
 * one: diffs only contain fragments, so whole-file context is not available.
 * highlight.js escapes the input, so its HTML output is safe to inject.
 */
export function useHighlighter(language: string | null): Highlighter | null {
  const [hljs, setHljs] = useState<HljsApi | null>(null);
  useEffect(() => {
    if (!language) return;
    let alive = true;
    void loadHljs().then((api) => {
      if (alive) setHljs(() => api);
    });
    return () => {
      alive = false;
    };
  }, [language]);

  return useMemo(() => {
    if (!language || !hljs?.getLanguage(language)) return null;
    const cache = new Map<string, string>();
    return (code: string) => {
      let html = cache.get(code);
      if (html === undefined) {
        html =
          code.length > 2000 ? escape(code) : hljs.highlight(code, { language, ignoreIllegals: true }).value;
        cache.set(code, html);
      }
      return html;
    };
  }, [hljs, language]);
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
