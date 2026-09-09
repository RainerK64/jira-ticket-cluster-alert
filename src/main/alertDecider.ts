import { AlertRecord, IssueCluster } from "../shared/types";

export function getNewIssueKeys(cluster: IssueCluster, previousAlert?: AlertRecord): string[] {
  const alertedKeys = new Set(previousAlert?.issueKeys || []);
  return cluster.issues.map((issue) => issue.key).filter((key) => !alertedKeys.has(key));
}

export function shouldAlertCluster(
  cluster: IssueCluster,
  threshold: number,
  previousAlert?: AlertRecord,
): boolean {
  if (cluster.issues.length < threshold) {
    return false;
  }

  if (!previousAlert) {
    return true;
  }

  return getNewIssueKeys(cluster, previousAlert).length > 0;
}
