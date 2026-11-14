export function authorLabel(from: { username?: string; first_name?: string } | undefined): string {
  if (from === undefined) {
    return 'unknown sender';
  }
  if (typeof from.username === 'string' && from.username.length > 0) {
    return `@${from.username}`;
  }
  if (typeof from.first_name === 'string' && from.first_name.length > 0) {
    return from.first_name;
  }
  return 'unknown sender';
}

export function attributedText(author: string, chatTitle: string, text: string): string {
  return `From ${author} in ${chatTitle}: ${text}`;
}
