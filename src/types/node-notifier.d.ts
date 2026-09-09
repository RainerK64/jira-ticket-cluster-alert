declare module 'node-notifier' {
  type NotificationOptions = {
    title?: string;
    message?: string;
    sound?: boolean | string;
    wait?: boolean;
  };

  const notifier: {
    notify(options: NotificationOptions): void;
  };

  export default notifier;
}
