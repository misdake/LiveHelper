import './websites'
import { getWebSites, Living } from './types'
import { parseJSON } from './utils'

const Websites = getWebSites()
const DirtyKey = 'dirty'
const UseSyncKey = 'useSync'
const ConfigKey = 'config'
const LastPollKey = 'last_poll'
const PollLastPollKey = 'poll_last_poll'

export interface Config {
  enabled?: Record<string, boolean>
  preference?: {
    interval?: number
    notification?: boolean
    preview?: boolean
    ignoreFirstNotify?: boolean
  }
}
export type Preference = Required<Required<Config>['preference']>

let useSync: boolean | null = null

function getArea(): chrome.storage.StorageArea {
  return useSync ? chrome.storage.sync : chrome.storage.local
}

async function initUseSync(): Promise<boolean> {
  if (useSync !== null) {
    return useSync
  }
  const storedValue = await new Promise<string | null>((resolve) => {
    chrome.storage.local.get(UseSyncKey, (items) => {
      resolve((items[UseSyncKey] as string | null) || null)
    })
  })
  const parsed = parseJSON(storedValue, false)
  // eslint-disable-next-line require-atomic-updates
  useSync = parsed
  return parsed
}

async function get<T>(key: string): Promise<T | undefined> {
  await initUseSync()
  return new Promise((res) => {
    getArea().get(key, (items) => {
      res(items[key] as T | undefined)
    })
  })
}

async function set(key: string, value: unknown): Promise<void> {
  await initUseSync()
  return new Promise((res) => {
    getArea().set({
      [key]: value
    }, res)
  })
}

export async function setConfig(config: Config) {
  return set(ConfigKey, config)
}

export async function getConfig() {
  return await get<Config>(ConfigKey) || {
    preference: {
      interval: 5,
      notification: true,
      preview: true,
      ignoreFirstNotify: true
    }
  }
}

export async function getEnabledWebsites() {
  const cfg = await getConfig()
  return Websites.filter(i => cfg.enabled && cfg.enabled[i.id])
}

export async function setLastPoll(value: Record<string, Living>) {
  await initUseSync()
  return set(LastPollKey, value)
}

let lastPollCache: Record<string, Living> = {}

export async function getLastPoll(): Promise<Record<string, Living>> {
  const result = await get<Record<string, Living>>(LastPollKey)
  lastPollCache = result || {}
  return lastPollCache
}

export async function setPollLastPoll(value: number) {
  await initUseSync()
  return set(PollLastPollKey, value)
}

let pollLastPollCache: number = 0

export async function getPollLastPoll(): Promise<number> {
  const result = await get<number>(PollLastPollKey)
  pollLastPollCache = result || 0
  return pollLastPollCache
}

export async function setDirty() {
  await initUseSync()
  return set(DirtyKey, true)
}

export async function getDirty(): Promise<boolean> {
  const result = await get<boolean>(DirtyKey)
  const ret = result === true
  if (ret) {
    await set(DirtyKey, false)
  }
  return ret
}

export async function getInterval() {
  const cfg = await getConfig()
  return cfg.preference?.interval || 5
}

export async function getSendNotification() {
  const cfg = await getConfig()
  return cfg.preference?.notification ?? true
}

let configChangeListeners: Array<() => void> = []

export function onConfigChange(callback: () => void) {
  configChangeListeners.push(callback)
  return () => {
    configChangeListeners = configChangeListeners.filter(cb => cb !== callback)
  }
}

export function notifyConfigChange() {
  configChangeListeners.forEach(cb => cb())
}
