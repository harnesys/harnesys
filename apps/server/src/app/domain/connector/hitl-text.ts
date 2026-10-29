export function mapApprovalText(text: string): 'approve' | 'deny' | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === 'approve' || normalized === 'yes') {
    return 'approve';
  }
  if (normalized === 'deny' || normalized === 'no') {
    return 'deny';
  }
  return null;
}
