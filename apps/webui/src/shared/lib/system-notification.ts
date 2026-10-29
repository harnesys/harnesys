let enabled = false;

export function enableSystemNotifications(): void {
  if (enabled || typeof window === 'undefined' || typeof Notification === 'undefined') {
    return;
  }
  enabled = true;
  const request = (): void => {
    document.removeEventListener('pointerdown', request);
    if (Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {
        // notification support unavailable
      });
    }
  };
  document.addEventListener('pointerdown', request, { once: true });
}

export function showSystemNotification(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }
  const notification = new Notification(title, { body, tag: 'harnesys-inbox' });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
