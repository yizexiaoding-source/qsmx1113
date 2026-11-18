import test from 'node:test';
import assert from 'node:assert/strict';
import { splitReviewText } from '../utils/reviewPosition.ts';

test('similarity rendering preserves punctuation, paragraphs and unreviewed text', () => {
    const text = '开头。\n\n“你好！”她说。\n末尾……';
    const parts = splitReviewText(text, [{ startIndex: 6, endIndex: 10 }]);
    assert.equal(parts.map(p => text.slice(p.start, p.end)).join(''), text);
    assert.ok(parts.find(p => p.sentenceIndex === 0 && p.start <= 8 && p.end > 8));
});

test('out of order and overlapping review ranges never duplicate body text', () => {
    const text = '甲乙丙丁戊己庚辛';
    const parts = splitReviewText(text, [
        { startIndex: 4, endIndex: 7 },
        { startIndex: 1, endIndex: 5 },
    ]);
    assert.equal(parts.map(p => text.slice(p.start, p.end)).join(''), text);
    assert.equal(parts.find(p => p.sentenceIndex === 1)?.start, 1);
});
