import notifier from 'node-notifier';
import { AlertCluster, AppStatus } from '../shared/types';

export function showPopup(alert: AlertCluster, status: AppStatus): void {
  notifier.notify({
    title: `Jira Alert: ${alert.count} similar tickets`,
    message: alert.issueKeys.join(', '),
    sound: true
  });

  console.log('\n========================================');
  console.log('JIRA TICKET CLUSTER ALERT');
  console.log('========================================');
  console.log(`Status: running`);
  console.log(`Started at: ${status.startedAt}`);
  console.log(`Last poll: ${status.lastPollAt ?? 'n/a'}`);
  console.log(`Last success: ${status.lastSuccessAt ?? 'n/a'}`);
  console.log(`Tickets seen: ${status.ticketsSeen}`);
  console.log(`Alerts sent: ${status.alertsSent}`);
  console.log('----------------------------------------');
  console.log(`Cluster score: ${alert.score.toFixed(2)}`);
  console.log(`Cluster: ${alert.signature}`);
  console.log(`Count: ${alert.count}`);
  for (let i = 0; i < alert.issueKeys.length; i++) {
    console.log(`- ${alert.issueKeys[i]} — ${alert.summaries[i] ?? ''}`);
  }
  console.log('========================================\n');
}

export function logHeartbeat(status: AppStatus, nextPollSeconds: number): void {
  console.log(`[running] last poll: ${status.lastPollAt ?? 'n/a'} | last success: ${status.lastSuccessAt ?? 'n/a'} | tickets seen: ${status.ticketsSeen} | alerts: ${status.alertsSent} | next poll in ${nextPollSeconds}s`);
}
