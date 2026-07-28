const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const PROFILE_PATH = '/var/lib/mai-push/puppeteer-profile';
const TMP_PROFILE = '/tmp/debug-puppeteer-profile';

(async () => {
  // Copy cookies from production profile
  const srcCookies = path.join(PROFILE_PATH, 'Default', 'Cookies');
  const dstDir = path.join(TMP_PROFILE, 'Default');
  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(srcCookies, path.join(dstDir, 'Cookies'));
  // Copy Local State for cookie decryption
  const srcLocalState = path.join(PROFILE_PATH, 'Local State');
  if (fs.existsSync(srcLocalState)) {
    fs.copyFileSync(srcLocalState, path.join(TMP_PROFILE, 'Local State'));
  }

  const browser = await puppeteer.launch({
    product: 'chrome',
    headless: 'new',
    userDataDir: TMP_PROFILE,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled', '--no-first-run',
      '--no-zygote', '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');

  try {
    console.log('Navigating to koinoya_mai...');
    await page.goto('https://x.com/koinoya_mai', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log('Page title:', await page.title());
    console.log('Page URL:', page.url());
    
    const isLogin = await page.evaluate(() => {
      return document.title.includes('ログイン') || 
             document.title.includes('Log in') || 
             location.href.includes('/login') ||
             !!document.querySelector('a[href="/login"]');
    });
    console.log('Is login page:', isLogin);
    
    await new Promise(r => setTimeout(r, 5000));
    await page.evaluate(() => window.scrollBy(0, 2000));
    await new Promise(r => setTimeout(r, 2000));
    
    const articleCount = await page.evaluate(() => document.querySelectorAll('article').length);
    console.log('Article count:', articleCount);
    
    const text = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || 'no body text');
    console.log('Page text:', text);
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
    fs.rmSync(TMP_PROFILE, { recursive: true, force: true });
  }
})();
