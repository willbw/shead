const MUTE_KEY = 'shead_muted'

let audio_ctx: AudioContext | null = null
let _muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === 'true'

export function is_muted(): boolean {
  return _muted
}

export function set_muted(muted: boolean): void {
  _muted = muted
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MUTE_KEY, String(muted))
  }
}

function get_ctx(): AudioContext | null {
  if (!audio_ctx) {
    try {
      audio_ctx = new AudioContext()
    } catch {
      return null
    }
  }
  return audio_ctx
}

type Sound_name = 'card_play' | 'burn' | 'error' | 'your_turn' | 'game_over' | 'skip' | 'reverse'

export function play_sound(name: Sound_name): void {
  if (_muted) return
  const ctx = get_ctx()
  if (!ctx) return

  const now = ctx.currentTime

  switch (name) {
    case 'card_play': {
      // Short click/snap
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, now)
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.08)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.1)
      break
    }
    case 'burn': {
      // Whoosh / fire sound
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(200, now)
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.4)
      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.4)
      break
    }
    case 'error': {
      // Buzz
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(150, now)
      gain.gain.setValueAtTime(0.1, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.2)
      break
    }
    case 'your_turn': {
      // Two-note chime
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(523, now) // C5
      gain1.gain.setValueAtTime(0.15, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
      osc1.connect(gain1).connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.2)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(659, now + 0.15) // E5
      gain2.gain.setValueAtTime(0.001, now)
      gain2.gain.setValueAtTime(0.15, now + 0.15)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc2.connect(gain2).connect(ctx.destination)
      osc2.start(now + 0.15)
      osc2.stop(now + 0.35)
      break
    }
    case 'game_over': {
      // Descending tone
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(600, now)
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.6)
      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.6)
      break
    }
    case 'skip': {
      // Quick ascending blip
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(400, now)
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.15)
      break
    }
    case 'reverse': {
      // Descending-then-ascending swoosh
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, now)
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.15)
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.3)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.35)
      break
    }
  }
}
