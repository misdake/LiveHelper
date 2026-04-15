import React, { useState, useEffect, useCallback } from 'react'
import { render } from 'react-dom'
import { Localized } from '@fluent/react'
import { LocalizationProvider } from './langs'
import Loading from './loading'
import { Cache, CacheItem, Living, PollErrorType, CacheError } from './types'

import './styles/popup.less'

interface ItemProps {
  room: Living
}

const Item: React.FC<ItemProps> = ({ room }) => {
  const handleClick = useCallback(() => {
    window.open(room.url)
  }, [room])
  return <div className='item' onClick={handleClick}>
    <div className='preview'>
      <img src={room.preview} alt={room.title} />
    </div>
    <div className='info'>
      <div className='title' title={room.title}>{room.title}</div>
      <div className='author'>{room.author}</div>
      <div className='online'>{room.online}</div>
    </div>
  </div>
}

const ShowError: React.FC<{ err: CacheError }> = ({ err: { type, message } }) => {
  if (type === PollErrorType.NotLogin) {
    return <Localized id='error-not-login'><span className='error'>Error not login</span></Localized>
  } else if (message) {
    return <Localized id={message}><span className='error'>{message}</span></Localized>
  } else {
    return <Localized id='error-unknown' ><span className='error'>Unknown error</span></Localized>
  }
}

const Site: React.FC<{
  id: string
  item: CacheItem
}> = ({ id, item }) => {
  const handleClick = useCallback(() => {
    window.open(item.info.homepage)
  }, [item])
  return <div className='site'>
    <div className="site-header">
      <div className="site-name" onClick={handleClick}>
        <img className="site-icon" alt={id} src={`/icon/websites/${id}.svg`} />
        <Localized id={`site-${id}`}>{id}</Localized>
      </div>
    </div>
    {
      !item.error ?
        item.living.length === 0 ?
          <span className='info'><Localized id='no-room' /></span> :
          item.living.map((i, id) => <Item key={id} room={i} />) :
        <ShowError err={item.error} />
    }
  </div>
}

const GoOption: React.FC = ({ children }) => <a href='options.html'>{children}</a>
const Widget: Record<string, React.ReactElement> = {
  GoOption: <GoOption></GoOption>
}

const Popup: React.FC = () => {
  const [list, setList] = useState<Cache>({})
  const [polling, setPolling] = useState(false)

  useEffect(() => {
    const handleMessage = (m: { type: string, cache: Cache, polling: boolean }) => {
      if (m.type === 'sync') {
        setList(m.cache || {})
        setPolling(m.polling)
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
      if (response) {
        setList(response.cache || {})
        setPolling(response.polling)
      }
    })

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  const keys = Object.keys(list)

  return <LocalizationProvider>
    <div className='status' data-polling={polling}>
      <div className='polling'>
        <Loading />
        <span><Localized id='loading' /></span>
      </div>
    </div>
    <div>
      {keys.length > 0 ?
        keys.map(k => <Site key={k} id={k} item={list[k]} />) :
        <div className='go-option-tip'>
          <Localized {...Widget} id='goto-option'><></></Localized>
        </div>}
    </div>
  </LocalizationProvider>
}

render(<Popup />, document.getElementById('app'))
