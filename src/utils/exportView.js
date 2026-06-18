import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

async function waitForStableAssets(element) {
  await document.fonts?.ready?.catch?.(() => {});
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }));
}

function dataUrlToBytes(dataUrl) {
  const [, base64 = ''] = dataUrl.split(',');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function saveBytes(bytes, filename, extension, mimeType) {
  if (window.__TAURI_INTERNALS__) {
    const path = await save({
      defaultPath: filename,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    if (!path) return false;
    await writeFile(path, bytes);
    return true;
  }

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

async function captureElement(element) {
  if (!element) throw new Error('Aucune vue à exporter.');
  await waitForStableAssets(element);
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width || element.scrollWidth));
  const height = Math.max(1, Math.ceil(rect.height || element.scrollHeight));
  return toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#111111',
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: 'none',
    },
  });
}

export async function exportElementAsPng(element, filename = 'caltemp.png') {
  const dataUrl = await captureElement(element);
  const bytes = dataUrlToBytes(dataUrl);
  return saveBytes(bytes, filename, 'png', 'image/png');
}

export async function exportElementAsPdf(element, filename = 'caltemp.pdf') {
  const dataUrl = await captureElement(element);
  const image = new Image();
  image.src = dataUrl;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const pdf = new jsPDF({
    orientation: image.width > image.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [image.width, image.height],
  });
  pdf.addImage(dataUrl, 'PNG', 0, 0, image.width, image.height);
  const bytes = new Uint8Array(pdf.output('arraybuffer'));
  return saveBytes(bytes, filename, 'pdf', 'application/pdf');
}
