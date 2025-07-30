const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const { join } = require('path');

async function generateImage(data, outputType = 'png') {
  console.log('Generating image with data:', JSON.stringify(data));
  const jsonData = {
    title: "Dilly Comparison Table",
    items: data.rows.map(row => {
      const item = {};
      data.columns.forEach((col, index) => {
        item[col.key] = row[index]?.value || 'N/A';
      });
      return item;
    }),
  };

  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${jsonData.title}</title>
      <style>
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid black; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <h1>${jsonData.title}</h1>
      <table>
        <tr>${data.columns.map(col => `<th>${col.header || col.key}</th>`).join('')}</tr>
        ${jsonData.items.map(item => `
          <tr>
            ${data.columns.map(col => `<td>${item[col.key] !== undefined ? item[col.key] : 'N/A'}</td>`).join('')}
          </tr>
        `).join('')}
      </table>
    </body>
    </html>
  `;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    console.log('Puppeteer browser launched.');
  } catch (err) {
    console.error('Puppeteer launch error:', err);
    throw err;
  }

  const page = await browser.newPage();
  const tempHtmlPath = join(__dirname, 'temp.html');
  await fs.writeFile(tempHtmlPath, htmlTemplate);
  console.log('Temporary HTML file written:', tempHtmlPath);

  try {
    await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle0' });
    console.log('Page loaded from temp HTML.');
  } catch (err) {
    console.error('Page goto error:', err);
    await browser.close();
    throw err;
  }

  const outputDir = join(process.cwd(), 'output');
  try {
    if (!await fs.access(outputDir).then(() => true).catch(() => false)) {
      console.log('Output directory does not exist, creating:', outputDir);
      await fs.mkdir(outputDir, { recursive: true });
    } else {
      console.log('Output directory already exists:', outputDir);
    }
  } catch (err) {
    console.error('Error ensuring output directory exists:', err);
    await browser.close();
    throw err;
  }

  const outputPath = join(outputDir, `output.${outputType}`);
  try {
    if (outputType === 'pdf') {
      await page.pdf({ path: outputPath, format: 'A4' });
    } else if (outputType === 'png') {
      console.log('Attempting to take screenshot and save to:', outputPath);
      await page.screenshot({ path: outputPath, fullPage: true });
    }
    console.log('Image generated successfully at:', outputPath);
  } catch (err) {
    console.error('Screenshot/PDF error:', err);
    await browser.close();
    throw err;
  }

  try {
    await fs.unlink(tempHtmlPath);
    console.log('Temporary HTML file deleted.');
  } catch (err) {
    console.warn('Could not delete temporary HTML file:', err);
  }

  await browser.close();
  console.log('Puppeteer browser closed.');

  return outputPath;
}

module.exports = { generateImage };