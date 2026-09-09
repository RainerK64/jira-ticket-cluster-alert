import { BrowserWindow, Notification } from "electron";
import { IssueCluster } from "../shared/types";

export class AlertService {
  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  notifyCluster(cluster: IssueCluster): void {
    const title = `${cluster.issues.length} similar Jira tickets detected`;
    const body = `${cluster.issues.map((issue) => issue.key).join(", ")}\n${cluster.representativeSummary}`;
    const window = this.getWindow();

    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
      });
      notification.on("click", () => {
        if (window) {
          window.show();
          window.focus();
        }
      });
      notification.show();
      return;
    }

    if (window) {
      window.show();
      window.focus();
    }
  }
}
