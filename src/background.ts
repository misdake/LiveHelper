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
      console.log('Config changed, triggering poll')
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
  console.log('=== beginLive:', item.title, 'by', item.author)
  if (await config.getSendNotification()) {
    console.log('=== Creating notification for:', item.title)
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
  console.log('=== endLive:', item.title)
  chrome.notifications.clear(item.url)
}

async function handlePoll(from: From) {
  console.log('=== handlePoll started, from:', From[from])
  const startTime = +new Date()

  console.log('=== Getting config... ===')
  const enabledWebsites = await config.getEnabledWebsites()
  console.log('=== Enabled websites:', enabledWebsites.map(w => w.id))

  const cfg = await config.getConfig()
  console.log('=== Config:', cfg)

  const notification = !!(cfg.preference?.notification)
  console.log('=== Notification enabled:', notification)

  if (notification || from === From.User) {
    console.log('=== Polling with notification enabled ===')
    polling = true
    notifyAll()

    const all: Living[] = []
    cache.filterKeys(enabledWebsites.map(i => i.id))
    console.log('=== Filtered cache keys:', enabledWebsites.map(i => i.id))

    await Promise.all(enabledWebsites.map(async w => {
      console.log('=== Processing website:', w.id)
      let error: CacheError | undefined
      try {
        console.log('=== Getting living for:', w.id)
        const living = await w.getLiving()
        console.log('=== Got living for', w.id, ':', living.length, 'rooms')
        all.push(...living)
        cache.set(w.id, {
          lastUpdate: now(),
          info: w,
          living: living.sort(orderBy),
          error,
        })
      } catch (e) {
        console.log('=== Error getting living for', w.id, ':', e)
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
      console.log('=== Notifying all after', w.id)
      notifyAll()
    }))
    const living = dictByUrl(all)
    const lastLiving = await config.getLastPoll()
    console.log('=== Last living:', Object.keys(lastLiving))
    console.log('=== Current living:', Object.keys(living))

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
    console.log('=== Poll done in', +new Date() - startTime, 'ms')
    await config.setPollLastPoll(now())
    console.log('=== Notifying all after poll done ===')
    notifyAll()
  } else if (from === From.ConfigChange && enabledWebsites.length > 0) {
    console.log('=== Polling from config change ===')
    polling = true
    notifyAll()

    cache.filterKeys(enabledWebsites.map(i => i.id))
    console.log('=== Filtered cache keys for config change:', enabledWebsites.map(i => i.id))

    await Promise.all(enabledWebsites.map(async w => {
      console.log('=== Processing website for config change:', w.id)
      let error: CacheError | undefined
      try {
        console.log('=== Getting living for', w.id, 'from config change')
        const living = await w.getLiving()
        console.log('=== Got living for', w.id, ':', living.length, 'rooms')
        cache.set(w.id, {
          lastUpdate: now(),
          info: w,
          living: living.sort(orderBy),
          error,
        })
      } catch (e) {
        console.log('=== Error getting living for', w.id, ':', e)
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
      console.log('=== Notifying all after', w.id, 'config change')
      notifyAll()
    }))

    polling = false
    console.log('=== Config change poll done ===')
    notifyAll()
  } else {
    console.log('=== Skipping poll (no conditions met) ===')
  }
}

function notifyAll() {
  const message = {
    type: 'sync' as const,
    cache: cache.toJSON(),
    polling,
  }
  console.log('=== Notifying all:', {
    type: message.type,
    cacheKeys: Object.keys(message.cache),
    polling: message.polling
  })
  chrome.runtime.sendMessage(message).catch((err) => {
    console.log('=== Send message error:', err)
  })
}

export { }
