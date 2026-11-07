import {beforeEach,describe,expect,it} from 'vitest';
import {parseYouTubeId,shouldLoop,nextBeatTime,loopStartAt,loopEndAt,eligibilityServiceMissing,loadSettings,saveSettings,DEFAULT_SETTINGS,sanitizeSettings,youtubePlayerOrigin} from './youtube';
describe('YouTube URL parser',()=>{it.each([
 ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=18s','dQw4w9WgXcQ'],
 ['https://youtu.be/dQw4w9WgXcQ?si=abc','dQw4w9WgXcQ'],
 ['https://youtube.com/shorts/dQw4w9WgXcQ','dQw4w9WgXcQ'],
 ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',null],
 ['https://example.com/watch?v=dQw4w9WgXcQ',null],
])('%s',(url,id)=>expect(parseYouTubeId(url)).toBe(id));});
describe('release configuration',()=>{it('requires an HTTPS eligibility service in release builds but allows local development',()=>{expect(eligibilityServiceMissing(false,undefined)).toBe(true);expect(eligibilityServiceMissing(false,'not a URL')).toBe(true);expect(eligibilityServiceMissing(false,'http://worker.example')).toBe(true);expect(eligibilityServiceMissing(false,'https://worker.example')).toBe(false);expect(eligibilityServiceMissing(true,undefined)).toBe(false);});});
describe('YouTube player identity',()=>{it('uses a stable HTTPS app origin in packaged builds and the local origin in development',()=>{expect(youtubePlayerOrigin(false,'file://')).toBe('https://com.musictrain.desktop');expect(youtubePlayerOrigin(true,'http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173');});});
describe('stored practice settings',()=>{
 beforeEach(()=>localStorage.clear());
 it('saves settings independently per video and restores them',()=>{const settings={...DEFAULT_SETTINGS,bpm:132,speed:0.75};expect(saveSettings('dQw4w9WgXcQ',settings)).toBe(true);expect(loadSettings('dQw4w9WgXcQ')).toEqual(settings);expect(loadSettings('M7lc1UVf-VE')).toEqual(DEFAULT_SETTINGS);});
 it('restores the metronome off so it always needs an explicit start',()=>{const settings={...DEFAULT_SETTINGS,metronomeEnabled:true};saveSettings('dQw4w9WgXcQ',settings);expect(loadSettings('dQw4w9WgXcQ').metronomeEnabled).toBe(false);});
 it('falls back to defaults for broken JSON and sanitizes old or invalid values',()=>{localStorage.setItem('practice:dQw4w9WgXcQ','{');expect(loadSettings('dQw4w9WgXcQ')).toEqual(DEFAULT_SETTINGS);expect(sanitizeSettings({bpm:900,firstBeat:-3,speed:0,loopA:8,loopB:2,volume:4})).toEqual({...DEFAULT_SETTINGS,bpm:240,volume:1});});
});
describe('practice timing',()=>{it('loops at B only for valid in-range boundaries',()=>{expect(shouldLoop(10,20,4,10)).toBe(true);expect(shouldLoop(10,9,4,10)).toBe(false);expect(shouldLoop(10,20,10,4)).toBe(false);});it('keeps marked boundaries ordered and inside the video',()=>{expect(loopStartAt(20,20,null)).toBe(19.9);expect(loopEndAt(20,20,19.9)).toBe(20);expect(loopStartAt(3,20,2)).toBe(1.9);expect(loopEndAt(2,20,3)).toBe(3.1);expect(loopStartAt(0,20,0)).toBeNull();});it('calculates beat grid on video time',()=>expect(nextBeatTime(2.1,1,120)).toBe(2.5));});
