import http from 'http';
import { loadConfig } from './config';
import { JiraClient } from './jiraClient';
import { runWatcher } from './watcher';
import { getRecentAlerts, getStatus, updateStatus } from './storage';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function main(): Promise<void> {
  const config = loadConfig();
  const initialStatus = getStatus();
  updateStatus({ running: true, startedAt: initialStatus.startedAt || new Date().toISOString() });

  const jira = new JiraClient(config.jiraBaseUrl, config.jiraEmail, config.jiraApiToken);
  let serverStarted = false;

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    if (req.url === '/' || req.url.startsWith('/status')) {
      const current = getStatus();
      const recentAlerts = getRecentAlerts();
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
              ul { padding-left: 20px; }
              li { margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Jira Ticket Cluster Alert</h1>
              <p class="running">Running</p>
              <p>Started at: <code>${current.startedAt}</code></p>
              <p>Last poll: <code>${current.lastPollAt ?? 'n/a'}</code></p>
              <p>Last success: <code>${current.lastSuccessAt ?? 'n/a'}</code></p>
              <p>Last error: <code>${current.lastError ?? 'none'}</code></p>
              <p>Next poll: <code>${current.nextPollAt ?? 'n/a'}</code></p>
              <p>Tickets seen: <code>${current.ticketsSeen}</code></p>
              <p>Alerts sent: <code>${current.alertsSent}</code></p>
              <h2>Recent alerts</h2>
              ${recentAlerts.length ? `
                <ul>
                  ${recentAlerts.map((alert) => `
                    <li>
                      <strong>${alert.issueKeys.map(escapeHtml).join(', ')}</strong><br />
                      <span class="muted">${alert.summaries.map(escapeHtml).join(' | ')}</span>
                    </li>
                  `).join('')}
                </ul>
              ` : '<p class="muted">No alerts yet.</p>'}
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

  server.on('error', (err) => {
    console.error(`Status server error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });

  const tryListen = (port: number): Promise<number> => new Promise((resolve) => {
    const onError = (err: any) => {
      server.off('error', onError);
      if (err && err.code === 'EADDRINUSE') {
        resolve(0);
      } else {
        throw err;
      }
    };

    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      resolve(port);
    });
  });

  const startedPort = await tryListen(config.appStatusPort);
  if (!startedPort) {
    const fallbackPort = config.appStatusPort + 1;
    await tryListen(fallbackPort);
    console.log(`Port ${config.appStatusPort} was busy, using ${fallbackPort} instead.`);
  }
  serverStarted = true;

  console.log(`Status page: http://localhost:${startedPort || config.appStatusPort + 1}`);
  console.log('Jira Ticket Cluster Alert started.');
  console.log(`Polling every ${config.pollIntervalSeconds} seconds...`);

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
  setInterval(tick, config.pollIntervalSeconds * 1000).unref();

  process.on('SIGINT', () => {
    updateStatus({ running: false, lastError: 'Stopped by user' });
    if (serverStarted) server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
