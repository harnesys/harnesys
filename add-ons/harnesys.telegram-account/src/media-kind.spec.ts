import { describe, expect, test } from 'bun:test';
import { kindOfMime, kindOfName, mediaFileName, resolveMediaKind } from './media-kind.ts';

describe('outgoing media kind', () => {
  test('reads the kind from the file extension', () => {
    expect(kindOfName('holiday.JPG')).toBe('photo');
    expect(kindOfName('clip.mp4')).toBe('video');
    expect(kindOfName('note.ogg')).toBe('voice');
    expect(kindOfName('song.mp3')).toBe('audio');
    expect(kindOfName('loop.gif')).toBe('gif');
    expect(kindOfName('report.pdf')).toBeNull();
    expect(kindOfName('archive')).toBeNull();
  });

  test('reads the kind from the mime type and resolves auto', () => {
    expect(kindOfMime('image/png')).toBe('photo');
    expect(kindOfMime('image/gif')).toBe('gif');
    expect(kindOfMime('video/webm; codecs=vp9')).toBe('video');
    expect(kindOfMime('audio/ogg')).toBe('voice');
    expect(kindOfMime('application/pdf')).toBeNull();
    expect(kindOfMime(null)).toBeNull();

    expect(resolveMediaKind('auto', 'photo.png', 'application/octet-stream')).toBe('photo');
    expect(resolveMediaKind('auto', 'blob', 'video/mp4')).toBe('video');
    expect(resolveMediaKind('auto', 'blob', null)).toBe('document');
    expect(resolveMediaKind('voice', 'audio.mp3', 'audio/mpeg')).toBe('voice');
  });

  test('forces an extension that matches the requested kind', () => {
    expect(mediaFileName('a.txt', 'photo')).toBe('a.jpg');
    expect(mediaFileName('a.JPG', 'photo')).toBe('a.JPG');
    expect(mediaFileName('sub/dir/pic.png', 'document')).toBe('pic.bin');
    expect(mediaFileName(' ', 'document')).toBe('file.bin');
  });
});
