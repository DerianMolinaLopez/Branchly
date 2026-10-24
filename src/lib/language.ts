/** highlight.js language for a file path, or null when unknown. */
export function languageFor(path: string): string | null {
  const name = path.split('/').pop()?.toLowerCase() ?? '';
  if (name in BY_NAME) return BY_NAME[name] ?? null;
  const dot = name.lastIndexOf('.');
  if (dot === -1) return null;
  return BY_EXTENSION[name.slice(dot + 1)] ?? null;
}

const BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  'cmakelists.txt': 'cmake',
  '.gitignore': 'bash',
  '.bashrc': 'bash',
  '.zshrc': 'bash',
};

const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  md: 'markdown',
  mdx: 'markdown',
  rs: 'rust',
  py: 'python',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sql: 'sql',
  swift: 'swift',
  lua: 'lua',
  dart: 'dart',
  scala: 'scala',
  ex: 'elixir',
  exs: 'elixir',
  diff: 'diff',
  patch: 'diff',
};
