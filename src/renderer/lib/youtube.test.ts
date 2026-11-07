import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {parseYouTubeId,shouldLoop,nextBeatTime,nextBeatSchedule,beatIndexAt,loopStartAt,loopEndAt,eligibilityServiceMissing,eligibilityErrorMessage,loadSettings,saveSettings,loadLastVideoId,saveLastVideoId,clearLastVideoId,DEFAULT_SETTINGS,sanitizeSettings,youtubePlayerOrigin,isDownbeat,clampPosition,videoTimeAtPointer,loadPracticeSegments,savePracticeSegments} from './youtube';
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
describe('saved practice segments',()=>{
 beforeEach(()=>localStorage.clear());
 afterEach(()=>vi.restoreAllMocks());
 const verse={id:'segment-1',label:'Куплет',loopA:12,loopB:28};
 it('stores cleaned segment labels independently for each video',()=>{
  expect(savePracticeSegments('dQw4w9WgXcQ',[{...verse,label:'  Куплет  '}])).toBe(true);
  expect(loadPracticeSegments('dQw4w9WgXcQ')).toEqual([verse]);
  expect(loadPracticeSegments('M7lc1UVf-VE')).toEqual([]);
 });
 it('rejects empty, overlong, duplicate, or invalid ranges without replacing saved rows',()=>{
  expect(savePracticeSegments('dQw4w9WgXcQ',[verse])).toBe(true);
  expect(savePracticeSegments('dQw4w9WgXcQ',[verse,{...verse,label:'Другой'}])).toBe(false);
  expect(savePracticeSegments('dQw4w9WgXcQ',[verse,{...verse,id:'segment-2',label:'куплет'}])).toBe(false);
  expect(savePracticeSegments('dQw4w9WgXcQ',[{...verse,label:'  '}])).toBe(false);
  expect(savePracticeSegments('dQw4w9WgXcQ',[{...verse,label:'а'.repeat(41)}])).toBe(false);
  expect(savePracticeSegments('dQw4w9WgXcQ',[{...verse,loopA:28,loopB:28}])).toBe(false);
  expect(loadPracticeSegments('dQw4w9WgXcQ')).toEqual([verse]);
 });
 it('discards malformed stored rows and duplicate IDs or names',()=>{
  localStorage.setItem('practice-segments:dQw4w9WgXcQ',JSON.stringify([
   verse,{...verse,id:'segment-2',label:'куплет'},{...verse,id:'segment-1',label:'Припев'},
   {...verse,id:'segment-3',loopA:-1},{...verse,id:'segment-4',loopB:Number.POSITIVE_INFINITY},null,
  ]));
  expect(loadPracticeSegments('dQw4w9WgXcQ')).toEqual([verse]);
 });
 it('returns an empty list for malformed JSON and invalid video IDs',()=>{
  localStorage.setItem('practice-segments:dQw4w9WgXcQ','{');
  expect(loadPracticeSegments('dQw4w9WgXcQ')).toEqual([]);
  expect(loadPracticeSegments('not-a-video-id')).toEqual([]);
  expect(savePracticeSegments('not-a-video-id',[verse])).toBe(false);
 });
 it('contains local-storage read and write failures',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('unavailable');});
  expect(loadPracticeSegments('dQw4w9WgXcQ')).toEqual([]);
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('unavailable');});
  expect(savePracticeSegments('dQw4w9WgXcQ',[verse])).toBe(false);
 });
});
describe('remembered video storage',()=>{
 beforeEach(()=>localStorage.clear());
 afterEach(()=>vi.restoreAllMocks());
 it('saves and loads a valid video ID under the remembered-video key',()=>{
  expect(saveLastVideoId('dQw4w9WgXcQ')).toBe(true);
  expect(localStorage.getItem('lastVideoId')).toBe('dQw4w9WgXcQ');
  expect(loadLastVideoId()).toBe('dQw4w9WgXcQ');
 });
 it.each(['', 'short', 'dQw4w9WgXc!', 'abcdefghijk?'])('returns null for malformed stored video ID %j',storedId=>{
  localStorage.setItem('lastVideoId',storedId);
  expect(loadLastVideoId()).toBeNull();
 });
 it('rejects an invalid ID without replacing the remembered video',()=>{
  localStorage.setItem('lastVideoId','dQw4w9WgXcQ');
  expect(saveLastVideoId('invalid')).toBe(false);
  expect(localStorage.getItem('lastVideoId')).toBe('dQw4w9WgXcQ');
 });
 it('contains local storage exceptions and returns safe results',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('unavailable');});
  expect(loadLastVideoId()).toBeNull();
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('unavailable');});
  expect(saveLastVideoId('dQw4w9WgXcQ')).toBe(false);
  vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw new Error('unavailable');});
  expect(clearLastVideoId()).toBe(false);
 });
 it('clears the remembered video while preserving its practice settings',()=>{
  localStorage.setItem('lastVideoId','dQw4w9WgXcQ');
  localStorage.setItem('practice:dQw4w9WgXcQ','{"bpm":132}');
  expect(clearLastVideoId()).toBe(true);
  expect(localStorage.getItem('lastVideoId')).toBeNull();
  expect(localStorage.getItem('practice:dQw4w9WgXcQ')).toBe('{"bpm":132}');
 });
});
describe('meter and downbeat accent',()=>{
 it('defaults old profiles to 4/4 and sanitizes unsupported meters',()=>{expect(DEFAULT_SETTINGS.timeSignature).toBe(4);expect(sanitizeSettings({bpm:120}).timeSignature).toBe(4);expect(sanitizeSettings({timeSignature:5}).timeSignature).toBe(4);});
 it('accents the first beat of each selected bar',()=>{expect([0,1,2,3,4,5,6].map(i=>isDownbeat(i,3))).toEqual([true,false,false,true,false,false,true]);expect([0,1,2,3,4,5,8].map(i=>isDownbeat(i,4))).toEqual([true,false,false,false,true,false,true]);expect(isDownbeat(-1,3)).toBe(false);});
});
describe('active beat index',()=>{
 it('keeps the marked first beat strict and stays inactive before its anchor',()=>{expect(beatIndexAt(0.99,1,120)).toBe(-1);expect(beatIndexAt(0.979,1,120)).toBe(-1);});
 it('returns a zero-based beat index from the recording position',()=>{expect(beatIndexAt(1,1,120)).toBe(0);expect(beatIndexAt(1.5,1,120)).toBe(1);expect(beatIndexAt(2,1,120)).toBe(2);});
 it('uses the scheduler 20 ms tolerance for subsequent beat boundaries',()=>{expect(beatIndexAt(1.48,1,120)).toBe(1);expect(beatIndexAt(1.479,1,120)).toBe(0);expect(beatIndexAt(0.98,1,120)).toBe(-1);});
 it('returns no active beat for invalid timing input',()=>{expect(beatIndexAt(1,1,0)).toBe(-1);expect(beatIndexAt(1,1,Number.NaN)).toBe(-1);expect(beatIndexAt(Number.NaN,1,120)).toBe(-1);});
});
describe('video position bounds',()=>{it('clamps finite positions to the video and handles invalid values',()=>{expect(clampPosition(-5,180)).toBe(0);expect(clampPosition(185,180)).toBe(180);expect(clampPosition(42.5,180)).toBe(42.5);expect(clampPosition(Number.NaN,180)).toBe(0);expect(clampPosition(10,0)).toBe(0);});});
describe('loop timeline coordinate mapping',()=>{
 it('maps pointer X to recording time across the timeline',()=>{
  expect(videoTimeAtPointer(100,100,1000,180)).toBe(0);
  expect(videoTimeAtPointer(600,100,1000,180)).toBe(90);
  expect(videoTimeAtPointer(1100,100,1000,180)).toBe(180);
 });
 it('clamps pointer positions beyond the timeline bounds',()=>{
  expect(videoTimeAtPointer(50,100,1000,180)).toBe(0);
  expect(videoTimeAtPointer(1200,100,1000,180)).toBe(180);
 });
 it('returns null for invalid coordinates, track width, or duration',()=>{
  expect(videoTimeAtPointer(Number.NaN,100,1000,180)).toBeNull();
  expect(videoTimeAtPointer(100,Number.POSITIVE_INFINITY,1000,180)).toBeNull();
  expect(videoTimeAtPointer(100,100,0,180)).toBeNull();
  expect(videoTimeAtPointer(100,100,1000,0)).toBeNull();
 });
});
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
  expect(text).not.toContain('Попробуй позже');
  expect(text).toContain('Открой видео на YouTube');
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
