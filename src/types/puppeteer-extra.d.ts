declare module 'puppeteer-extra' {
  import type { Browser } from 'puppeteer-core';
  const puppeteerExtra: {
    use: (plugin: any) => void;
    launch: (options?: any) => Promise<Browser>;
  };
  export default puppeteerExtra;
}

declare module 'puppeteer-extra-plugin-stealth' {
  const plugin: () => any;
  export default plugin;
}
