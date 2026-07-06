// Single source of truth for install/standalone/platform state — adapted from
// Mirror's proven useInstallState. Drives the install prompt (Android one-tap +
// iOS add-to-home-screen tutorial).
import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// beforeinstallprompt fires before React mounts — capture it at module init.
let capturedPrompt: BeforeInstallPromptEvent | null = null
const promptListeners = new Set<() => void>()
function notify(): void {
  for (const fn of promptListeners) {
    try {
      fn()
    } catch {
      /* isolate listeners */
    }
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    capturedPrompt = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    capturedPrompt = null
    notify()
  })
}

function detectIsIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isiPadOS = /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(ua) || isiPadOS
}
function isIOSInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|Snapchat|MicroMessenger|WeChat/.test(ua)
}
function detectIsStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return true
  return false
}

const DISMISS_KEY = 'gg.installBanner.dismissedV1'
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}
function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* private mode — accept loss */
  }
}

export interface InstallState {
  isStandalone: boolean
  isInstallable: boolean
  isIOS: boolean
  isIOSInstallable: boolean
  canPromptInstall: boolean
  shouldShowIOSTutorial: boolean
  wasDismissed: boolean
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
  dismissPromptForever: () => void
}

export function useInstallState(): InstallState {
  const [isStandalone, setIsStandalone] = useState<boolean>(detectIsStandalone)
  const [hasPrompt, setHasPrompt] = useState<boolean>(() => capturedPrompt !== null)
  const [wasDismissed, setWasDismissed] = useState<boolean>(readDismissed)
  const [isIOS] = useState<boolean>(detectIsIOS)
  const [isIOSInstallable] = useState<boolean>(() => detectIsIOS() && !isIOSInAppBrowser())

  useEffect(() => {
    const update = () => setHasPrompt(capturedPrompt !== null)
    promptListeners.add(update)
    return () => {
      promptListeners.delete(update)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(display-mode: standalone)')
    const update = () => setIsStandalone(detectIsStandalone())
    if (mql.addEventListener) {
      mql.addEventListener('change', update)
      return () => mql.removeEventListener('change', update)
    } else if (mql.addListener) {
      mql.addListener(update)
      return () => mql.removeListener(update)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const prompt = capturedPrompt
    if (!prompt) return 'unavailable'
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      capturedPrompt = null
      notify()
      return choice.outcome
    } catch {
      capturedPrompt = null
      notify()
      return 'dismissed'
    }
  }, [])

  const dismissPromptForever = useCallback(() => {
    writeDismissed()
    setWasDismissed(true)
  }, [])

  return {
    isStandalone,
    isInstallable: hasPrompt,
    isIOS,
    isIOSInstallable,
    canPromptInstall: hasPrompt && !isStandalone && !wasDismissed,
    shouldShowIOSTutorial: isIOSInstallable && !isStandalone && !wasDismissed,
    wasDismissed,
    promptInstall,
    dismissPromptForever,
  }
}
