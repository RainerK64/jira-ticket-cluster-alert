import http from 'http';
import { loadConfig } from './config';
import { JiraClient } from './jiraClient';
import { runWatcher } from './watcher';
import { getStatus, updateStatus } from './storage';

async function main(): Promise<void> {
  const config = loadConfig();
  const status = getStatus();
  updateStatus({ running: true, startedAt: status.startedAt || new Date().toISOString() });

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    if (req.url === '/' || req.url.startsWith('/status')) {
      const current = getStatus();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <head>
            <title>Jira Ticket Cluster Alert</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; background: #f7f9fc; color: #1f2937; }
              .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.08); max-width: 720px; }
              .running { color: #0f766e; font-weight: bold; }
              .muted { color: #6b7280; }
              code { background: #eef2ff; padding: 2px 6px; border-radius: 6px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Jira Ticket Cluster Alert</h1>
              <p class="running">Running</p>
              <p>Started at: <code>${current.startedAt}</code></p>
              <p>Last poll: <code>${current.lastPollAt ?? 'n/a'}</code></p>
              <p>Last success: <code>${current.lastSuccessAt ?? 'n/a'}</code></p>
              <p>Next poll: <code>${current.nextPollAt ?? 'n/a'}</code></p>
              <p>Tickets seen: <code>${current.ticketsSeen}</code></p>
              <p>Alerts sent: <code>${current.alertsSent}</code></p>
              <p class="muted">Keep this window open to see live status.</p>
            </div>
          </body>
        </html>
      `);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(config.appStatusPort, () => {
    console.log(`Status page: http://localhost:${config.appStatusPort}`);
    console.log('Jira Ticket Cluster Alert started.');
    console.log(`Polling every ${config.pollIntervalSeconds} seconds...`);
  });

  const jira = new JiraClient(config.jiraBaseUrl, config.jiraEmail, config.jiraApiToken);

  const tick = async () => {
    try {
      await runWatcher(jira, config.jiraProjectKey, config.similarityThreshold, config.alertWindowHours, config.pollIntervalSeconds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus({ lastError: message, lastPollAt: new Date().toISOString() });
      console.error('Watcher error:', error);
    }
  };

  await tick();
  setInterval(tick, config.pollIntervalSeconds * 1000);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
