import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

export async function exportElementAsPng(element, filename = 'caltemp.png') {
  if (!element) throw new Error('Aucune vue à exporter.');
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#111111',
  });
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

export async function exportElementAsPdf(element, filename = 'caltemp.pdf') {
  if (!element) throw new Error('Aucune vue à exporter.');
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#111111',
  });
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
  pdf.save(filename);
}
