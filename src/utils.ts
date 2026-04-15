import { parse, HTMLElement } from 'node-html-parser'
import { useState, useEffect } from 'react'
import deepmerge from 'deepmerge'
import { Maybe } from './types'

export { HTMLElement } from 'node-html-parser'
export { deepmerge }

export function useNow() {
  const [ time, setTime ] = useState(now())
  useEffect(() => {
    const id = setInterval(() => setTime(now()), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

/**
 * return current time in seconds
 */
export function now() {
  return Math.floor(+new Date() / 1000)
}

export function parseJSON(s: any, def: any = undefined) {
  try {
    return JSON.parse(s)
  } catch (e) {
    return def
  }
}

export class LocalMap<V> {
  private mem: Record<string, V>
  private id: ReturnType<typeof setTimeout> | undefined
  private initialized: boolean = false
  
  constructor(private name: string) {
    this.mem = {}
  }
  
  async init(): Promise<void> {
    if (this.initialized) {
      return
    }
    this.initialized = true
    
    if (typeof window === 'undefined') {
      const items = await new Promise<Record<string, any>>((resolve) => {
        chrome.storage.local.get(this.name, (result) => {
          resolve(result)
        })
      })
      if (items[this.name]) {
        this.mem = parseJSON(items[this.name]) || {}
      }
    } else {
      this.mem = parseJSON(window.localStorage.getItem(this.name)) || {}
    }
  }
  
  set(k: string, v: V) {
    this.mem[k] = v
    this.save()
  }
  get(k: string) {
    return this.mem[k]
  }
  filterKeys(keys: string[]) {
    for (const key of Object.keys(this.mem)) {
      if (!keys.includes(key)) {
        delete this.mem[key]
      }
    }
  }
  private save() {
    if (this.id !== undefined) {
      clearTimeout(this.id)
      this.id = undefined
    }
    this.id = setTimeout(() => {
      const data = JSON.stringify(this.mem)
      if (typeof window === 'undefined') {
        chrome.storage.local.set({ [this.name]: data })
      } else {
        window.localStorage.setItem(this.name, data)
      }
    }, 0)
  }
  toJSON () {
    return JSON.parse(JSON.stringify(this.mem))
  }
}

export function parseHTML(html: string) {
  return (parse(html) as (HTMLElement & {
    valid: boolean;
  }))
}

type MaybePromise<T> = T | Promise<T>
export async function mapFilter<T, U>(ary: T[], f: (t: T) => MaybePromise<Maybe<U>>) {
  const promises = await Promise.all(ary.map(f))
  return promises.filter(Boolean) as U[]
}

/**
 * Parse views to number
 * @param views views could be:
 *   1.01万
 *   39.78万
 *   8,346
 *   16
 */
export function parseViews(views: string): number | undefined {
  const map: Record<string, number> = {
    '': 1,
    '万': 10000,
    '千': 1000,
    '百': 100,
  }
  const re = /^([\d.,]+)([万千百]?)$/.exec(views)
  if (re === null) {
    return undefined
  }
  const [ , num, unit ] = re
  return parseFloat(num.replace(/,/g, '')) * map[unit]
}

export function getCookie (opt: chrome.cookies.Details) {
  return new Promise<chrome.cookies.Cookie | null>((resolve, reject) => {
      chrome.cookies.get(opt, resolve)
  })
}

export function trimLeft (s: string, left: string) {
  if (s.startsWith(left)) {
    return s.slice(left.length)
  }
  return s
}
