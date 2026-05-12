
import { VIDEO_HOST_SUBSTRINGS } from './mediaDomains.js'

export function isVideoLikeHost(hostname: string | null): boolean {
  if (!hostname) return false
  const h = hostname.toLowerCase()
  return VIDEO_HOST_SUBSTRINGS.some((s) => h.includes(s))
}

export function inferAudibleFromHost(hostname: string | null): boolean {
  return isVideoLikeHost(hostname)
}