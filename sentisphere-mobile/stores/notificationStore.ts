/**
 * Notification Store - Global state management for notifications
 * Enables optimistic updates and real-time sync across screens
 */

export type Notification = {
  id: number;
  user_id: number;
  title: string | null;
  message: string;
  category: string;
  source: string;
  related_alert_id: number | null;
  is_sent: boolean;
  sent_at: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

type Listener = () => void;

class NotificationStore {
  private notifications: Notification[] = [];
  private isLoading: boolean = true;
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  getNotifications(): Notification[] {
    return this.notifications;
  }

  getIsLoading(): boolean {
    return this.isLoading;
  }

  getNotificationById(id: number): Notification | undefined {
    return this.notifications.find((n) => n.id === id);
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.is_read).length;
  }

  setNotifications(notifications: Notification[]): void {
    this.notifications = notifications;
    this.notify();
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.notify();
  }

  markAsRead(notificationId: number): void {
    this.notifications = this.notifications.map((n) =>
      n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
    );
    this.notify();
  }

  markAllAsRead(): void {
    const now = new Date().toISOString();
    this.notifications = this.notifications.map((n) =>
      !n.is_read ? { ...n, is_read: true, read_at: now } : n
    );
    this.notify();
  }

  addNotification(notification: Notification): void {
    this.notifications = [notification, ...this.notifications];
    this.notify();
  }

  updateNotification(notificationId: number, updates: Partial<Notification>): void {
    this.notifications = this.notifications.map((n) =>
      n.id === notificationId ? { ...n, ...updates } : n
    );
    this.notify();
  }
}

export const notificationStore = new NotificationStore();
