import {describe,expect,it} from 'vitest';
import {parseYouTubeId,shouldLoop,nextBeatTime} from './youtube';
describe('YouTube URL parser',()=>{it.each([
 ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=18s','dQw4w9WgXcQ'],
 ['https://youtu.be/dQw4w9WgXcQ?si=abc','dQw4w9WgXcQ'],
 ['https://youtube.com/shorts/dQw4w9WgXcQ','dQw4w9WgXcQ'],
 ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',null],
 ['https://example.com/watch?v=dQw4w9WgXcQ',null],
])('%s',(url,id)=>expect(parseYouTubeId(url)).toBe(id));});
describe('practice timing',()=>{it('loops at B only for valid in-range boundaries',()=>{expect(shouldLoop(10,20,4,10)).toBe(true);expect(shouldLoop(10,9,4,10)).toBe(false);expect(shouldLoop(10,20,10,4)).toBe(false);});it('calculates beat grid on video time',()=>expect(nextBeatTime(2.1,1,120)).toBe(2.5));});
