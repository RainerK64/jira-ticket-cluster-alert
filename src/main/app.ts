import http from 'http';
import { loadConfig } from './config';
import { JiraClient } from './jiraClient';
import { buildClusters, createAlertFromGroup } from './matcher';
import { runWatcher } from './watcher';
import { getRecentAlerts, getRecentIssues, getStatus, updateStatus } from './storage';
import {
  configureCustomIgnoredSummaries,
  getActiveIgnoredSummaries,
  getActiveIgnoredSummaryPrefixes,
  hoursAgoIso,
  isIgnoredSummary,
  isOnOrAfterIso
} from '../shared/utils';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function issueLink(baseUrl: string, key: string, url?: string): string {
  let safeUrl = `${baseUrl}/browse/${key}`;

  if (url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        safeUrl = parsedUrl.toString();
      }
    } catch {
      // Fall back to the expected Jira URL shape.
    }
  }

  const href = escapeHtml(safeUrl);
  const label = escapeHtml(key);
  return `<a href="${href}" target="_blank" rel="noreferrer" aria-label="${label}">${label}</a>`;
}

function renderTextList(values: string[]): string {
  if (!values.length) {
    return '<p class="muted">None.</p>';
  }

  return `
    <ul>
      ${values.map((value) => `<li><code>${escapeHtml(value)}</code></li>`).join('')}
    </ul>
  `;
}

async function main(): Promise<void> {
  const config = loadConfig();
  configureCustomIgnoredSummaries(config.customIgnoredSummaries, config.customIgnoredSummaryPrefixes);
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
      const alertWindowThreshold = hoursAgoIso(config.alertWindowHours);
      const currentClusters = buildClusters(
        getRecentIssues(500).filter((issue) =>
          isOnOrAfterIso(issue.updated, alertWindowThreshold) && !isIgnoredSummary(issue.summary)
        ),
        config.similarityThreshold
      ).map((group) => createAlertFromGroup(group));
      const recentAlerts = getRecentAlerts();
      const activeIgnoredSummaries = getActiveIgnoredSummaries();
      const activeIgnoredPrefixes = getActiveIgnoredSummaryPrefixes();
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
              .ticket-list { margin-top: 8px; }
              .ticket-list li { margin-bottom: 6px; }
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
              <p class="muted">Unrelated fetched tickets are hidden from this main view. Open <a href="/tickets">/tickets</a> to inspect all recent fetched tickets.</p>
              <h2>Current matching clusters</h2>
              ${currentClusters.length ? `
                <ul>
                  ${currentClusters.map((alert) => `
                    <li>
                      <ul class="ticket-list">
                        ${alert.issueKeys.map((key, index) => `
                          <li>${issueLink(config.jiraBaseUrl, key, alert.issueUrls[index])} — <span class="muted">${escapeHtml(alert.summaries[index] ?? '')}</span></li>
                        `).join('')}
                      </ul>
                    </li>
                  `).join('')}
                </ul>
              ` : '<p class="muted">No current matching clusters.</p>'}
              <h2>Recent alerts</h2>
              ${recentAlerts.length ? `
                <ul>
                  ${recentAlerts.map((alert) => `
                    <li>
                      <ul class="ticket-list">
                        ${alert.issueKeys.map((key, index) => `
                          <li>${issueLink(config.jiraBaseUrl, key, alert.issueUrls[index])} — <span class="muted">${escapeHtml(alert.summaries[index] ?? '')}</span></li>
                        `).join('')}
                      </ul>
                    </li>
                  `).join('')}
                </ul>
              ` : '<p class="muted">No alerts yet.</p>'}
              <h2>Active exclude list</h2>
              <p class="muted">Exact excludes</p>
              ${renderTextList(activeIgnoredSummaries)}
              <p class="muted">Prefix excludes</p>
              ${renderTextList(activeIgnoredPrefixes)}
              <p class="muted">Keep this window open to see live status.</p>
            </div>
          </body>
        </html>
      `);
      return;
    }

    if (req.url === '/tickets') {
      const recentIssues = getRecentIssues();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <head>
            <title>Recent Jira Tickets</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; background: #f7f9fc; color: #1f2937; }
              .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.08); max-width: 720px; }
              .muted { color: #6b7280; }
              ul { padding-left: 20px; }
              li { margin-bottom: 6px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Recent tickets seen</h1>
              <p><a href="/status">Back to main status page</a></p>
              ${recentIssues.length ? `
                <ul>
                  ${recentIssues.map((issue) => `
                    <li>${issueLink(config.jiraBaseUrl, issue.key, issue.url)} — <span class="muted">${escapeHtml(issue.summary)}</span></li>
                  `).join('')}
                </ul>
              ` : '<p class="muted">No tickets stored yet.</p>'}
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
