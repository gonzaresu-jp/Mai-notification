const puppeteer = require('puppeteer');

let sharedBrowser = null;
let browserInitPromise = null;

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--disk-cache-size=0',
  '--media-cache-size=0',
  '--disable-application-cache',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-translate',
  '--disable-extensions',
  '--disable-popup-blocking',
  '--mute-audio',
  '--blink-settings=imagesEnabled=false',
  '--disable-remote-fonts'
];

async function getSharedBrowser(options = {}) {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }

  if (browserInitPromise) {
    return await browserInitPromise;
  }

  browserInitPromise = (async () => {
    const {
      executablePath,
      product,
      headless = true,
      userDataDir,
      extraArgs = [],
      defaultViewport,
    } = options;

    try {
      const launchOptions = {
        headless,
        args: [...DEFAULT_ARGS, ...extraArgs]
      };

      if (executablePath) launchOptions.executablePath = executablePath;
      if (product) launchOptions.product = product;
      if (userDataDir) launchOptions.userDataDir = userDataDir;
      if (defaultViewport !== undefined) launchOptions.defaultViewport = defaultViewport;

      sharedBrowser = await puppeteer.launch(launchOptions);
      sharedBrowser.on('disconnected', () => {
        sharedBrowser = null;
        browserInitPromise = null;
      });

      return sharedBrowser;
    } catch (e) {
      browserInitPromise = null;
      throw e;
    }
  })();

  return await browserInitPromise;
}

async function closeSharedBrowser() {
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch (e) {
      // ignore
    }
  }
  sharedBrowser = null;
  browserInitPromise = null;
}

module.exports = {
  getSharedBrowser,
  closeSharedBrowser
};
