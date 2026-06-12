export interface IpcRequestMap {}
export interface IpcEventMap {}

export type IpcChannel = keyof IpcRequestMap;
export type IpcEventChannel = keyof IpcEventMap;
