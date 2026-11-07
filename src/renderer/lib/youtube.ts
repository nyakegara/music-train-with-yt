export function parseYouTubeId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] ?? null;
    if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (/^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split('/')[2] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export type PracticeSettings = { bpm:number; firstBeat:number; speed:number; loopA:number|null; loopB:number|null; metronomeEnabled:boolean; volume:number };
export const DEFAULT_SETTINGS: PracticeSettings = { bpm:100, firstBeat:0, speed:1, loopA:null, loopB:null, metronomeEnabled:false, volume:0.35 };
const storageKey = (id:string) => `practice:${id}`;
export function loadSettings(id:string):PracticeSettings { try { const value=localStorage.getItem(storageKey(id)); return value?{...DEFAULT_SETTINGS,...JSON.parse(value)}:{...DEFAULT_SETTINGS}; } catch { return {...DEFAULT_SETTINGS}; } }
export function saveSettings(id:string,settings:PracticeSettings):void { localStorage.setItem(storageKey(id),JSON.stringify(settings)); }
export function shouldLoop(position:number,duration:number,a:number|null,b:number|null):boolean { return a!==null && b!==null && a>=0 && a<b && b<=duration && position>=b; }
export function nextBeatTime(time:number,firstBeat:number,bpm:number):number { const beat=60/bpm; return firstBeat+Math.ceil((time-firstBeat-0.02)/beat)*beat; }
