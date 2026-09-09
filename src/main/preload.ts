import { contextBridge, ipcRenderer } from "electron";
import { AppStatusSnapshot } from "../shared/types";

contextBridge.exposeInMainWorld("appStatus", {
  getStatus: (): Promise<AppStatusSnapshot> => ipcRenderer.invoke("status:get"),
  onUpdate: (listener: (status: AppStatusSnapshot) => void): void => {
    ipcRenderer.on("status:update", (_event, status: AppStatusSnapshot) => listener(status));
  },
});
