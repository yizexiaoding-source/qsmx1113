import mammoth from 'mammoth';

const UNSUPPORTED_BINARY_EXTS = [
    '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
    '.mp3', '.wav', '.mp4', '.mov', '.zip', '.rar', '.7z', '.exe',
];

export function decodeTextBuffer(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let utf8 = new TextDecoder('utf-8').decode(bytes);
    if (utf8.includes('\uFFFD')) {
        try {
            const gbk = new TextDecoder('gbk').decode(bytes);
            const utf8ReplacementCount = (utf8.match(/\uFFFD/g) || []).length;
            const gbkReplacementCount = (gbk.match(/\uFFFD/g) || []).length;
            if (gbkReplacementCount < utf8ReplacementCount) {
                utf8 = gbk;
            }
        } catch {
            // Fallback decoder unavailable in current environment
        }
    }
    return utf8.replace(/^\uFEFF/, '');
}

export async function extractTextFromFile(file: File): Promise<string> {
    if (!file) {
        throw new Error('未选择文件');
    }
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.doc')) {
        throw new Error('暂不支持旧版 .doc 二进制格式，请先另存为 .docx 或 .txt 后再上传');
    }
    if (UNSUPPORTED_BINARY_EXTS.some((ext) => lowerName.endsWith(ext))) {
        throw new Error('暂仅支持文本文件（.txt / .md / .docx / .csv / .json）');
    }

    const arrayBuffer = await file.arrayBuffer();
    let content = '';
    if (lowerName.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ arrayBuffer });
        content = result.value || '';
    } else {
        content = decodeTextBuffer(arrayBuffer);
    }

    const normalized = content.replace(/\r\n/g, '\n').trim();
    if (!normalized) {
        throw new Error('文件内容为空，请确认文件后重试');
    }
    return normalized;
}

export function isManuscriptField(
    field: { label: string; type: string },
    imitationMode: boolean,
    textareaCount: number
): boolean {
    if (field.type !== 'textarea') return false;
    if (/(?:原稿|原文|全文|参考小说|小说正文|小说内容|参考文本|参考文章|参考作品)/.test(field.label)) {
        return true;
    }
    return imitationMode && textareaCount === 1;
}
