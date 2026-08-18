import { useSyncExternalStore } from 'react'
import {
  getPlaybackMode,
  subscribePlaybackMode,
  type PlaybackMode,
} from '../services/player/playbackMode'

/**
 * The current rig, as a value React will re-render for.
 *
 * The switch lives on the Music screen but the things it turns off — the player
 * bar above all — are mounted elsewhere and stay mounted. Reading the setting
 * straight would leave them on screen until a reload, so the DJ would flip the
 * switch and see nothing happen.
 */
export function usePlaybackMode(): PlaybackMode {
  return useSyncExternalStore(subscribePlaybackMode, getPlaybackMode)
}
