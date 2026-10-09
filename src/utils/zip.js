// Minimal, dependency-free ZIP reader for calendar exports (Google Agenda
// "Exporter" produces a .zip holding one .ics per calendar).
// Supports stored (0) and deflate (8) entries through DecompressionStream.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_COMMENT_LENGTH = 0xffff;

export const ZIP_LIMITS = {
    maxEntries: 200,
    maxEntryBytes: 25 * 1024 * 1024,
    maxTotalBytes: 80 * 1024 * 1024,
};

export function isZipBuffer(bytes) {
    return bytes?.length >= 4
        && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function findEndOfCentralDirectory(view) {
    const min = Math.max(0, view.byteLength - 22 - MAX_COMMENT_LENGTH);
    for (let offset = view.byteLength - 22; offset >= min; offset -= 1) {
        if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
    }
    return -1;
}

function decodeName(bytes, utf8) {
    try {
        return new TextDecoder(utf8 ? 'utf-8' : 'latin1').decode(bytes);
    } catch {
        return new TextDecoder().decode(bytes);
    }
}

async function inflateRaw(data) {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('La décompression ZIP n’est pas disponible sur ce système.');
    }
    const source = new ReadableStream({
        start(controller) {
            controller.enqueue(data);
            controller.close();
        },
    });
    const stream = source.pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Lists the files of a ZIP archive and returns the ones accepted by `filter`.
 * @returns {Promise<Array<{ name: string, bytes: Uint8Array }>>}
 */
export async function readZipEntries(input, { filter = () => true, limits = ZIP_LIMITS } = {}) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEndOfCentralDirectory(view);
    if (eocd < 0) throw new Error('Archive ZIP invalide.');

    const entryCount = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    if (entryCount > limits.maxEntries) throw new Error('Archive ZIP trop volumineuse.');

    const files = [];
    let totalBytes = 0;
    for (let index = 0; index < entryCount; index += 1) {
        if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
            throw new Error('Archive ZIP corrompue.');
        }
        const flags = view.getUint16(cursor + 8, true);
        const method = view.getUint16(cursor + 10, true);
        const compressedSize = view.getUint32(cursor + 20, true);
        const size = view.getUint32(cursor + 24, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        const localOffset = view.getUint32(cursor + 42, true);
        const name = decodeName(bytes.subarray(cursor + 46, cursor + 46 + nameLength), Boolean(flags & 0x0800));
        cursor += 46 + nameLength + extraLength + commentLength;

        if (name.endsWith('/') || name.startsWith('__MACOSX/') || !filter(name)) continue;
        if (flags & 0x0001) throw new Error(`« ${name} » est chiffré et ne peut pas être lu.`);
        if (size > limits.maxEntryBytes) throw new Error(`« ${name} » est trop volumineux.`);
        totalBytes += size;
        if (totalBytes > limits.maxTotalBytes) throw new Error('Archive ZIP trop volumineuse.');

        if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
            throw new Error('Archive ZIP corrompue.');
        }
        const dataStart = localOffset + 30
            + view.getUint16(localOffset + 26, true)
            + view.getUint16(localOffset + 28, true);
        const data = bytes.subarray(dataStart, dataStart + compressedSize);

        let content;
        if (method === 0) content = data;
        else if (method === 8) content = await inflateRaw(data);
        else throw new Error(`Compression non prise en charge pour « ${name} ».`);
        if (content.length > limits.maxEntryBytes) throw new Error(`« ${name} » est trop volumineux.`);

        files.push({ name, bytes: content });
    }
    return files;
}
