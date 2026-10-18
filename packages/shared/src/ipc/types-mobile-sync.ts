import { ipcChannels } from "./channels";
import type { MobileSyncStatus } from "../mobile-sync";

declare module "./maps" {
  interface IpcRequestMap {
    [ipcChannels.mobileSyncStatus]: { req: void; res: MobileSyncStatus };
    [ipcChannels.mobileSyncStart]: { req: void; res: MobileSyncStatus };
    [ipcChannels.mobileSyncStop]: { req: void; res: MobileSyncStatus };
    [ipcChannels.mobileSyncRefreshCode]: { req: void; res: MobileSyncStatus };
    [ipcChannels.mobileSyncSetAutoStart]: { req: { enabled: boolean }; res: { enabled: boolean } };
    [ipcChannels.mobileSyncRevokeDevice]: { req: { deviceId: string }; res: MobileSyncStatus };
  }
}
