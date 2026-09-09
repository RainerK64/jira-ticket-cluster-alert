import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { loadConfig } from "./config";
import { JiraClient } from "./jiraClient";
import { Storage } from "./storage";
import { AlertService } from "./alertService";
import { TicketWatcher } from "./watcher";
import { AppStatusSnapshot } from "../shared/types";

let mainWindow: BrowserWindow | null = null;
let latestStatus: AppStatusSnapshot = {
  configured: false,
  running: false,
  jiraProjectKey: "IT",
  pollIntervalSeconds: 60,
  similarityThreshold: 0.55,
  alertWindowHours: 24,
  clusterThreshold: 3,
  databasePath: path.resolve(process.cwd(), "data/jira-ticket-cluster-alert.sqlite"),
  totalRecentIssues: 0,
  currentClusters: [],
  recentAlerts: [],
  lastError: "App not started yet.",
};

function broadcastStatus(status: AppStatusSnapshot): void {
  latestStatus = status;
  mainWindow?.webContents.send("status:update", status);
}

function createWindow(rendererHtmlPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void window.loadFile(rendererHtmlPath);
  return window;
}

app.whenReady().then(() => {
  try {
    const config = loadConfig();
    mainWindow = createWindow(config.paths.rendererHtmlPath);

    const storage = new Storage(config.storage.databasePath);
    const watcher = new TicketWatcher(
      config,
      new JiraClient(config),
      storage,
      new AlertService(() => mainWindow),
      broadcastStatus,
    );

    latestStatus = {
      ...watcher.getStatus(),
      configured: true,
      running: false,
    };

    ipcMain.handle("status:get", async () => latestStatus);
    watcher.start();
  } catch (error) {
    const fallbackHtmlPath = path.resolve(__dirname, "../../../src/renderer/index.html");
    mainWindow = createWindow(fallbackHtmlPath);
    latestStatus = {
      ...latestStatus,
      configured: false,
      lastError: error instanceof Error ? error.message : "Unable to load configuration.",
    };
    ipcMain.handle("status:get", async () => latestStatus);
    broadcastStatus(latestStatus);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
