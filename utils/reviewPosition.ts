// All positions are UTF-16 offsets, matching textarea selections and review results.
export function splitReviewText(text: string, sentences: Array<{ startIndex: number; endIndex: number }>) {
    const parts: Array<{ start: number; end: number; sentenceIndex?: number }> = [];
    let cursor = 0;
    sentences.map((item, sentenceIndex) => ({ ...item, sentenceIndex }))
        .sort((a, b) => a.startIndex - b.startIndex)
        .forEach(item => {
            const start = Math.max(cursor, Math.min(text.length, item.startIndex));
            const end = Math.max(start, Math.min(text.length, item.endIndex));
            if (start > cursor) parts.push({ start: cursor, end: start });
            if (end > start) parts.push({ start, end, sentenceIndex: item.sentenceIndex });
            cursor = end;
        });
    if (cursor < text.length) parts.push({ start: cursor, end: text.length });
    return parts;
}

export function scrollToTextOffset(container: HTMLElement, offset: number) {
    const spans = container.querySelectorAll<HTMLElement>('[data-text-start]');
    const span = Array.from(spans).find(el => Number(el.dataset.textStart) <= offset && Number(el.dataset.textEnd) > offset)
        || spans[spans.length - 1];
    if (!span) return;
    const textNode = span.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const range = document.createRange();
    const local = Math.max(0, Math.min(textNode.textContent?.length || 0, offset - Number(span.dataset.textStart)));
    range.setStart(textNode, local);
    range.setEnd(textNode, Math.min(local + 1, textNode.textContent?.length || 0));
    const rect = range.getBoundingClientRect();
    container.scrollTop += rect.top - container.getBoundingClientRect().top - container.clientHeight / 3;
}

export function visibleTextOffset(container: HTMLElement): number {
    const top = container.getBoundingClientRect().top + 8;
    const spans = Array.from(container.querySelectorAll<HTMLElement>('[data-text-start]'));
    const span = spans.find(el => el.getBoundingClientRect().bottom > top) || spans[spans.length - 1];
    if (!span) return 0;
    const node = span.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return Number(span.dataset.textStart);
    const range = document.createRange();
    let low = 0, high = node.textContent?.length || 0;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        range.setStart(node, mid);
        range.setEnd(node, Math.min(mid + 1, node.textContent?.length || 0));
        if (range.getBoundingClientRect().bottom < top) low = mid + 1;
        else high = mid;
    }
    return Number(span.dataset.textStart) + low;
}

function textareaMirror(input: HTMLTextAreaElement) {
    const style = getComputedStyle(input);
    const mirror = document.createElement('div');
    for (const property of ['font', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing', 'wordBreak', 'overflowWrap', 'tabSize']) {
        mirror.style.setProperty(property.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), style[property as any]);
    }
    Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', width: `${input.clientWidth}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
    document.body.appendChild(mirror);
    return mirror;
}

export function visibleTextareaOffset(input: HTMLTextAreaElement) {
    const mirror = textareaMirror(input);
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    let low = 0, high = input.value.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        mirror.textContent = input.value.slice(0, mid);
        mirror.appendChild(marker);
        const y = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
        if (y < input.scrollTop) low = mid + 1;
        else high = mid;
    }
    mirror.remove();
    return low;
}

export function focusTextareaRange(input: HTMLTextAreaElement, start: number, end: number, focus = true) {
    const mirror = textareaMirror(input);
    mirror.textContent = input.value.slice(0, start);
    const marker = document.createElement('span');
    marker.textContent = input.value.slice(start, start + 1) || '\u200b';
    mirror.appendChild(marker);
    const y = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
    mirror.remove();
    if (focus) input.focus({ preventScroll: true });
    input.setSelectionRange(start, end);
    input.scrollTop = Math.max(0, y - input.clientHeight / 3);
}
