import { Living, CacheItem, CacheError, PollErrorType, PollError } from './types'
import { LocalMap, now } from '~/utils'
import * as config from './config'

enum From {
  Timer,
  User,
  ConfigChange,
}

interface Message {
  type: 'sync' | 'poll' | 'getState'
  cache?: Record<string, CacheItem>
  polling?: boolean
}

let polling = false
const cache = new LocalMap<CacheItem>('cache')

async function initCache() {
  await cache.init()
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'poll') {
    handlePoll(From.User)
    sendResponse({ success: true })
    return true
  } else if (message.type === 'getState') {
    sendResponse({
      cache: cache.toJSON(),
      polling
    })
    return true
  }
  return false
})

chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: id })
})

chrome.alarms.create({
  delayInMinutes: 1,
  periodInMinutes: 1,
})

chrome.alarms.onAlarm.addListener(async () => {
  const interval = await config.getInterval() * 60
  if (now() - await config.getPollLastPoll() < interval) {
    return
  }
  handlePoll(From.Timer)
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' || areaName === 'sync') {
    if (changes['config']) {
      handlePoll(From.ConfigChange)
    }
  }
})

function orderBy(b: Living, a: Living) {
  return (a.online || 0) - (b.online || 0)
}

function dictByUrl(all: Living[]) {
  const out: Record<string, Living> = {}
  for (const i of all) {
    out[i.url] = i
  }
  return out
}

async function beginLive(item: Living) {
  if (await config.getSendNotification()) {
    chrome.notifications.create(item.url, {
      type: 'basic',
      iconUrl: item.preview,
      title: item.title,
      message: '正在直播',
      contextMessage: item.author
    })
  }
}

function endLive(item: Living) {
  chrome.notifications.clear(item.url)
}

async function handlePoll(from: From) {
  const enabledWebsites = await config.getEnabledWebsites()
  const cfg = await config.getConfig()
  const notification = !!(cfg.preference?.notification)

  if (notification || from === From.User) {
    polling = true
    notifyAll()

    const all: Living[] = []
    cache.filterKeys(enabledWebsites.map(i => i.id))

    await Promise.all(enabledWebsites.map(async w => {
      let error: CacheError | undefined
      try {
        const living = await w.getLiving()
        all.push(...living)
        cache.set(w.id, {
          lastUpdate: now(),
          info: w,
          living: living.sort(orderBy),
          error,
        })
      } catch (e) {
        if (e instanceof PollError) {
          error = {
            type: e.type,
            message: e.message,
          }
        } else {
          error = {
            type: PollErrorType.Other,
            message: (e as Error).message
          }
        }
        cache.set(w.id, {
          lastUpdate: now(),
          info: w,
          living: [],
          error,
        })
      }
      notifyAll()
    }))
    const living = dictByUrl(all)
    const lastLiving = await config.getLastPoll()

    for (const [key, value] of Object.entries(living)) {
      if (!lastLiving[key]) {
        beginLive(value)
      }
    }
    for (const [key, value] of Object.entries(lastLiving)) {
      if (!living[key]) {
        endLive(value)
      }
    }
    await config.setLastPoll(living)

    polling = false
    await config.setPollLastPoll(now())
    notifyAll()
  } else if (from === From.ConfigChange && enabledWebsites.length > 0) {
    polling = true
    notifyAll()

    cache.filterKeys(enabledWebsites.map(i => i.id))

    await Promise.all(enabledWebsites.map(async w => {
      let error: CacheError | undefined
      try {
        const living = await w.getLiving()
        cache.set(w.id, {
          lastUpdate: now(),
          info: w,
          living: living.sort(orderBy),
          error,
        })
      } catch (e) {
        if (e instanceof PollError) {
          error = {
            type: e.type,
            message: e.message,
          }
        } else {
          error = {
            type: PollErrorType.Other,
            message: (e as Error).message
          }
        }
        cache.set(w.id, {
          lastUpdate: now(),
          info: w,
          living: [],
          error,
        })
      }
      notifyAll()
    }))

    polling = false
    notifyAll()
  }
}

function notifyAll() {
  chrome.runtime.sendMessage({
    type: 'sync',
    cache: cache.toJSON(),
    polling,
  }).catch(() => { })
}

initCache()

export { }
