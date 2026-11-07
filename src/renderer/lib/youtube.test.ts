import {describe,expect,it} from 'vitest';
import {parseYouTubeId,shouldLoop,nextBeatTime,loopStartAt,loopEndAt,eligibilityServiceMissing} from './youtube';
describe('YouTube URL parser',()=>{it.each([
 ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=18s','dQw4w9WgXcQ'],
 ['https://youtu.be/dQw4w9WgXcQ?si=abc','dQw4w9WgXcQ'],
 ['https://youtube.com/shorts/dQw4w9WgXcQ','dQw4w9WgXcQ'],
 ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',null],
 ['https://example.com/watch?v=dQw4w9WgXcQ',null],
])('%s',(url,id)=>expect(parseYouTubeId(url)).toBe(id));});
describe('release configuration',()=>{it('blocks release builds without the eligibility service but allows local development',()=>{expect(eligibilityServiceMissing(false,undefined)).toBe(true);expect(eligibilityServiceMissing(false,'https://worker.example')).toBe(false);expect(eligibilityServiceMissing(true,undefined)).toBe(false);});});
describe('practice timing',()=>{it('loops at B only for valid in-range boundaries',()=>{expect(shouldLoop(10,20,4,10)).toBe(true);expect(shouldLoop(10,9,4,10)).toBe(false);expect(shouldLoop(10,20,10,4)).toBe(false);});it('keeps marked boundaries ordered and inside the video',()=>{expect(loopStartAt(20,20,null)).toBe(19.9);expect(loopEndAt(20,20,19.9)).toBe(20);expect(loopStartAt(3,20,2)).toBe(1.9);expect(loopEndAt(2,20,3)).toBe(3.1);expect(loopStartAt(0,20,0)).toBeNull();});it('calculates beat grid on video time',()=>expect(nextBeatTime(2.1,1,120)).toBe(2.5));});
