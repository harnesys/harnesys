export interface LspCatalogSpec {
  serverId: string;
  label: string;
  description: string;
  command: string;
  args?: string[];
  extensionToLanguage: Record<string, string>;
  install: string;
}

export const LSP_CATALOG: LspCatalogSpec[] = [
  {
    serverId: 'typescript',
    label: 'TypeScript / JavaScript',
    description: 'Diagnostics, hover, references for TS and JS projects.',
    command: 'typescript-language-server',
    args: ['--stdio'],
    extensionToLanguage: {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
    },
    install: 'npm i -g typescript-language-server typescript',
  },
  {
    serverId: 'python',
    label: 'Python (Pyright)',
    description: 'Diagnostics and symbols for Python via Pyright.',
    command: 'pyright-langserver',
    args: ['--stdio'],
    extensionToLanguage: {
      '.py': 'python',
      '.pyi': 'python',
    },
    install: 'npm i -g pyright',
  },
  {
    serverId: 'go',
    label: 'Go (gopls)',
    description: 'Diagnostics, hover and navigation for Go.',
    command: 'gopls',
    extensionToLanguage: {
      '.go': 'go',
    },
    install: 'go install golang.org/x/tools/gopls@latest',
  },
  {
    serverId: 'rust',
    label: 'Rust (rust-analyzer)',
    description: 'Diagnostics, hover and navigation for Rust.',
    command: 'rust-analyzer',
    extensionToLanguage: {
      '.rs': 'rust',
    },
    install: 'rustup component add rust-analyzer',
  },
  {
    serverId: 'css',
    label: 'CSS',
    description: 'Diagnostics and completions for CSS (vscode-langservers-extracted).',
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    extensionToLanguage: {
      '.css': 'css',
    },
    install: 'npm i -g vscode-langservers-extracted',
  },
  {
    serverId: 'html',
    label: 'HTML',
    description: 'Diagnostics and completions for HTML (vscode-langservers-extracted).',
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    extensionToLanguage: {
      '.html': 'html',
    },
    install: 'npm i -g vscode-langservers-extracted',
  },
  {
    serverId: 'stylelint',
    label: 'CSS (Stylelint)',
    description:
      'Full stylelint diagnostics for CSS/LESS/SCSS, including property values. Requires a stylelint config in the project (.stylelintrc).',
    command: 'stylelint-language-server',
    args: ['--stdio'],
    extensionToLanguage: {
      '.css': 'css',
      '.less': 'less',
      '.scss': 'scss',
    },
    install: 'npm i -g @stylelint/language-server stylelint',
  },
  {
    serverId: 'markuplint',
    label: 'HTML (Markuplint)',
    description:
      'Real markuplint diagnostics for HTML, including unclosed and misnested tags. Requires a markuplint config for custom rules; default rules apply otherwise.',
    command: 'markuplint-language-server',
    args: ['--stdio'],
    extensionToLanguage: {
      '.html': 'html',
    },
    install: 'npm i -g @markuplint/language-server markuplint',
  },
  {
    serverId: 'json',
    label: 'JSON',
    description: 'Diagnostics and completions for JSON (vscode-langservers-extracted).',
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    extensionToLanguage: {
      '.json': 'json',
    },
    install: 'npm i -g vscode-langservers-extracted',
  },
  {
    serverId: 'bash',
    label: 'Bash',
    description: 'Diagnostics and symbols for shell scripts.',
    command: 'bash-language-server',
    args: ['start'],
    extensionToLanguage: {
      '.sh': 'shellscript',
      '.bash': 'shellscript',
    },
    install: 'npm i -g bash-language-server',
  },
  {
    serverId: 'yaml',
    label: 'YAML',
    description: 'Diagnostics and schema validation for YAML.',
    command: 'yaml-language-server',
    args: ['--stdio'],
    extensionToLanguage: {
      '.yaml': 'yaml',
      '.yml': 'yaml',
    },
    install: 'npm i -g yaml-language-server',
  },
];

const INSTALL_BY_COMMAND = new Map<string, string>(
  LSP_CATALOG.map((entry) => [entry.command, entry.install]),
);

export function installForCommand(command: string): string | undefined {
  return INSTALL_BY_COMMAND.get(command);
}

export interface LspInstallSpec {
  command: string;
  install: string;
}
