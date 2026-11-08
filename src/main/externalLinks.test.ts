import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl, youtubeWatchUrl } from './externalLinks.js';

describe('youtubeWatchUrl', () => {
  it('normalizes a valid video id to a clean watch URL', () => {
    expect(youtubeWatchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it.each(['', 'short', 'dQw4w9WgXcQ&list=bad', 'https://example.com/dQw4w9WgXcQ'])('rejects invalid video id %s', (id) => {
    expect(youtubeWatchUrl(id)).toBeNull();
  });
});

describe('isAllowedExternalUrl', () => {
  it.each([
    'https://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtubetoolkit.com/tools/bpm-finder',
    'https://www.youtubetoolkit.com/tools/bpm-finder',
  ])('allows %s', (url) => expect(isAllowedExternalUrl(url)).toBe(true));

  it.each([
    'http://youtubetoolkit.com/tools/bpm-finder',
    'https://youtubetoolkit.com/tools/bpm-finder/other',
    'https://youtubetoolkit.com/tools/other',
    'https://youtubetoolkit.com.evil.example/tools/bpm-finder',
    'https://evil.example/?next=https://youtubetoolkit.com/tools/bpm-finder',
    'javascript:alert(1)',
    'not a URL',
    'https://user@youtubetoolkit.com/tools/bpm-finder',
    'https://youtubetoolkit.com:8443/tools/bpm-finder',
    'https://youtubetoolkit.com/tools/bpm-finder?video=dQw4w9WgXcQ',
    'https://youtubetoolkit.com/tools/bpm-finder#video',
  ])('blocks %s', (url) => expect(isAllowedExternalUrl(url)).toBe(false));
});
