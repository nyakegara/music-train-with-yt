import {beforeEach,describe,expect,it} from 'vitest';
import {parseYouTubeId,shouldLoop,nextBeatTime,nextBeatSchedule,loopStartAt,loopEndAt,eligibilityServiceMissing,eligibilityErrorMessage,loadSettings,saveSettings,DEFAULT_SETTINGS,sanitizeSettings,youtubePlayerOrigin,isDownbeat,clampPosition} from './youtube';
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
describe('meter and downbeat accent',()=>{
 it('defaults old profiles to 4/4 and sanitizes unsupported meters',()=>{expect(DEFAULT_SETTINGS.timeSignature).toBe(4);expect(sanitizeSettings({bpm:120}).timeSignature).toBe(4);expect(sanitizeSettings({timeSignature:5}).timeSignature).toBe(4);});
 it('accents the first beat of each selected bar',()=>{expect([0,1,2,3,4,5,6].map(i=>isDownbeat(i,3))).toEqual([true,false,false,true,false,false,true]);expect([0,1,2,3,4,5,8].map(i=>isDownbeat(i,4))).toEqual([true,false,false,false,true,false,true]);expect(isDownbeat(-1,3)).toBe(false);});
});
describe('video position bounds',()=>{it('clamps finite positions to the video and handles invalid values',()=>{expect(clampPosition(-5,180)).toBe(0);expect(clampPosition(185,180)).toBe(180);expect(clampPosition(42.5,180)).toBe(42.5);expect(clampPosition(Number.NaN,180)).toBe(0);expect(clampPosition(10,0)).toBe(0);});});
describe('eligibility service error messages',()=>{
 const message=(code:string|undefined,retryAfter:string|null=null,retryable?:boolean)=>eligibilityErrorMessage(code,retryAfter,retryable);
 it('maps known Worker errors to distinct user guidance',()=>{
  const codes=['rate_limited','upstream_rate_limited','upstream_unavailable','quota_exceeded','youtube_api_forbidden'];
  const messages=codes.map(code=>message(code,'30'));
  expect(messages.every(Boolean)).toBe(true);
  expect(new Set(messages).size).toBe(codes.length);
 });
 it('formats retry delays in seconds and whole minutes',()=>{
  expect(message('rate_limited','45')).toContain('45 секунд');
  expect(message('upstream_rate_limited','120')).toContain('2 минуты');
 });
 it('uses the service unavailable flag to distinguish temporary limits from missing configuration',()=>{
  expect(message('service_unavailable','60',true)).toContain('1 минут');
  expect(message('service_unavailable','60',false)).not.toContain('1 минут');
 });
 it('does not suggest an immediate retry when the response explicitly says it is not retryable',()=>{
  expect(message('rate_limited','60',false)).not.toContain('через');
 });
 it('gives upstream rejections safe non-retry guidance',()=>{
  const text=message('upstream_rejected','120',false);
  expect(text).toBeTruthy();
  expect(text).not.toContain('120');
 });
 it.each([null,'','0','3601','later','1.5'])('does not show an invalid retry delay (%s)',retryAfter=>{
  const text=message('upstream_unavailable',retryAfter);
  expect(text).toBeTruthy();
  expect(text).not.toMatch(/\d+ секунд|\d+ минут/);
 });
 it('uses the generic fallback for unknown Worker error codes',()=>{
  expect(message('unexpected_code','60')).toBe('Не удалось проверить видео. Попробуй позже.');
 });
});
describe('practice timing',()=>{it('loops at B only for valid in-range boundaries',()=>{expect(shouldLoop(10,20,4,10)).toBe(true);expect(shouldLoop(10,9,4,10)).toBe(false);expect(shouldLoop(10,20,10,4)).toBe(false);});it('keeps marked boundaries ordered and inside the video',()=>{expect(loopStartAt(20,20,null)).toBe(19.9);expect(loopEndAt(20,20,19.9)).toBe(20);expect(loopStartAt(3,20,2)).toBe(1.9);expect(loopEndAt(2,20,3)).toBe(3.1);expect(loopStartAt(0,20,0)).toBeNull();});it('calculates the next beat on video time and waits for the first marked beat',()=>{expect(nextBeatTime(2.1,1,120)).toBe(2.5);expect(nextBeatTime(4,5.3,100)).toBe(5.3);});it('schedules the next grid beat after an off-beat seek or loop start',()=>{const seekSchedule=nextBeatSchedule(2.1,1,120,0.5);expect(seekSchedule).toMatchObject({beatTime:2.5,beatIndex:3});expect(seekSchedule.audioDelay).toBeCloseTo(0.8);const loopStartSchedule=nextBeatSchedule(4.1,1,120,1.25);expect(loopStartSchedule).toMatchObject({beatTime:4.5,beatIndex:7});expect(loopStartSchedule.audioDelay).toBeCloseTo(0.32);});});
