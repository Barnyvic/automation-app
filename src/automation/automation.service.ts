import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { TaskLog } from './entities/task-log.entity';
import { CardInput } from './dto/card.input';
import { retryAsync } from '../common/utils/retry.util';
import type { Browser, Page, Frame } from 'puppeteer-core';

type LoginArgs = { email: string; password: string };
type CardUpdateMetadata = {
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
};

type PuppeteerLauncher = {
  launch: (options?: any) => Promise<Browser>;
  use?: (plugin: any) => void;
};

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(TaskLog)
    private readonly taskLogRepository: Repository<TaskLog>,
  ) {}

  private resolveChromeExecutable(): string | undefined {
    if (process.env.CHROME_EXECUTABLE_PATH) {
      return process.env.CHROME_EXECUTABLE_PATH;
    }
    if (process.platform === 'win32') {
      return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    }
    return undefined;
  }

  private async launchBrowser(): Promise<Browser> {
    const executablePath = this.resolveChromeExecutable();
    this.logger.log(
      `Launching browser (executablePath=${executablePath ?? 'system default'})`,
    );
    let launcher: PuppeteerLauncher;
    try {
      const peModule = (await import('puppeteer-extra')) as unknown;
      launcher = peModule as PuppeteerLauncher;
      try {
        const stealthModule = (await import(
          'puppeteer-extra-plugin-stealth'
        )) as unknown;
        const maybeFactory =
          (stealthModule as Record<string, unknown>).default ?? stealthModule;
        if (
          typeof maybeFactory === 'function' &&
          typeof (launcher as Record<string, unknown>).use === 'function'
        ) {
          (launcher as { use: (p: unknown) => void }).use(
            (maybeFactory as () => unknown)(),
          );
          this.logger.log('puppeteer-extra with stealth enabled');
        } else {
          this.logger.warn(
            'Stealth plugin shape unexpected; proceeding without it',
          );
        }
      } catch {
        this.logger.warn('Stealth plugin not available; proceeding without it');
      }
    } catch {
      const coreModule = (await import('puppeteer-core')) as unknown;
      launcher = coreModule as PuppeteerLauncher;
      this.logger.warn(
        'puppeteer-extra not available; falling back to puppeteer-core',
      );
    }

    return launcher.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }

  private getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRandomUserAgent(): string {
    const candidates = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    ];
    return candidates[this.getRandomInt(0, candidates.length - 1)];
  }

  private async preparePage(page: Page): Promise<void> {
    const width = this.getRandomInt(1280, 1920);
    const height = this.getRandomInt(720, 1080);
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setUserAgent(this.getRandomUserAgent());
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      DNT: '1',
      'Upgrade-Insecure-Requests': '1',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });
  }

  private async humanType(
    context: Page | Frame,
    selector: string,
    text: string,
  ): Promise<void> {
    await this.sleep(this.getRandomInt(120, 300));
    try {
      await context.focus(selector);
    } catch {
      this.logger.debug(`Failed to focus ${selector}`);
    }
    for (const char of text) {
      const delay = this.getRandomInt(40, 180);
      await context.type(selector, char, { delay });
      if (Math.random() < 0.05) {
        await this.sleep(this.getRandomInt(150, 350));
      }
    }
  }

  private async humanClick(
    context: Page | Frame,
    selector: string,
  ): Promise<boolean> {
    const handle = await context.$(selector);
    if (!handle) return false;
    await this.sleep(this.getRandomInt(80, 220));
    try {
      await handle.click({ delay: this.getRandomInt(40, 160) });
      return true;
    } catch {
      return false;
    }
  }

  private async loginToParamount(page: Page, args: LoginArgs): Promise<void> {
    this.logger.debug('Opening Paramount+ homepage');
    await page.goto('https://www.paramountplus.com/', {
      waitUntil: 'domcontentloaded',
    });
    await this.acceptCookieBanner(page).catch(() => undefined);

    const clickedSignIn = await this.clickByText(page, 'a,button', [
      'sign in',
      'log in',
    ]).catch(() => false);
    if (!clickedSignIn) {
      this.logger.debug(
        'SIGN IN button not found on homepage, going to /account',
      );
      await page.goto('https://www.paramountplus.com/account/', {
        waitUntil: 'domcontentloaded',
      });
    } else {
      await page
        .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
        .catch(() => undefined);
    }

    await this.acceptCookieBanner(page).catch(() => undefined);

    await retryAsync(
      async () => {
        await page.waitForSelector('input[name="email"]', { timeout: 5000 });
      },
      { retries: 5 },
    );
    let passwordVisible = false;
    try {
      await page.waitForSelector('input[name="password"]', { timeout: 5000 });
      passwordVisible = true;
    } catch {
      this.logger.debug(
        'Password not visible yet; attempting to continue after email',
      );
    }

    const emailCtx = await this.findFieldContext(page, [
      'input[name="email"]',
      'input#email',
      'input[type="email"]',
    ]);
    let passwordCtx: { context: Page | Frame; selector: string } | null = null;
    if (!passwordVisible) {
      await this.humanType(emailCtx.context, emailCtx.selector, args.email);
      const submitButtonLabels = ['continue', 'next', 'sign in'];
      const continued =
        (await this.clickByText(
          emailCtx.context,
          'button, [role="button"]',
          submitButtonLabels,
        ).catch(() => false)) || false;
      if (continued) {
        await page
          .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
          .catch(() => undefined);
      }
      await retryAsync(
        async () => {
          passwordCtx = await this.findFieldContext(page, [
            'input[name="password"]',
            'input#password',
            'input[type="password"]',
          ]);
        },
        { retries: 5 },
      );
    }
    if (!passwordCtx) {
      passwordCtx = await this.findFieldContext(page, [
        'input[name="password"]',
        'input#password',
        'input[type="password"]',
      ]);
    }

    this.logger.debug(`Typing credentials for email=${args.email}`);
    const emailValue = await emailCtx.context
      .$eval(
        emailCtx.selector,
        (el: any) => (el as HTMLInputElement).value || '',
      )
      .catch(() => '');
    if (!emailValue) {
      await this.humanType(emailCtx.context, emailCtx.selector, args.email);
    }
    await this.humanType(
      passwordCtx.context,
      passwordCtx.selector,
      args.password,
    );

    await retryAsync(
      async () => {
        const ctx = passwordCtx!.context;
        const clickedSubmit =
          (await this.humanClick(ctx, 'button[type="submit"]')) ||
          (await this.clickByText(ctx, 'button, [role="button"]', [
            'sign in',
            'log in',
            'continue',
          ]).catch(() => false));
        if (!clickedSubmit) {
          throw new Error('Unable to locate login submit button');
        }
        await page.waitForNavigation({
          waitUntil: 'networkidle2',
          timeout: 20000,
        });
      },
      { retries: 3 },
    );
    this.logger.debug('Login navigation completed');
  }

  private async acceptCookieBanner(page: Page): Promise<void> {
    const oneTrust = '#onetrust-accept-btn-handler';
    const candidates = [
      oneTrust,
      'button[aria-label="Accept all"]',
      'button[aria-label="Accept All"]',
    ];
    for (const sel of candidates) {
      const handle = await page.$(sel);
      if (handle) {
        await handle.click().catch(() => undefined);
        this.logger.debug(`Cookie banner accepted via selector: ${sel}`);
        return;
      }
    }
  }

  private async findFieldContext(
    page: Page,
    selectors: string[],
  ): Promise<{ context: Page | Frame; selector: string }> {
    for (const selector of selectors) {
      const found = await page
        .waitForSelector(selector, { timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (found) {
        return { context: page, selector };
      }
    }
    for (const frame of page.frames()) {
      for (const selector of selectors) {
        const found = await frame
          .waitForSelector(selector, { timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        if (found) {
          return { context: frame, selector };
        }
      }
    }
    const last = selectors[selectors.length - 1];
    await page.waitForSelector(last, { timeout: 10000 });
    return { context: page, selector: last };
  }

  private async clickByText(
    context: Page | Frame,
    selector: string,
    texts: string[],
  ): Promise<boolean> {
    const lowered = texts.map((t) => t.toLowerCase());
    const handles = await context.$$(selector);
    for (const handle of handles) {
      const text = await context.evaluate(
        (el) => (el.textContent || '').trim().toLowerCase(),
        handle,
      );
      if (!text) continue;
      if (lowered.some((t) => text.includes(t))) {
        await handle.click();
        return true;
      }
    }
    return false;
  }

  private detectCardBrand(cardNumber: string): string {
    const digits = cardNumber.replace(/[^0-9]/g, '');
    if (/^3[47]/.test(digits)) return 'AMEX';
    if (/^4/.test(digits)) return 'VISA';
    if (/^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/.test(digits)) return 'MASTERCARD';
    if (/^(6011|65|64[4-9])/.test(digits)) return 'DISCOVER';
    if (/^3(0[0-5]|[68])/.test(digits)) return 'DINERS';
    if (/^(2131|1800|35)/.test(digits)) return 'JCB';
    if (/^62/.test(digits)) return 'UNIONPAY';
    return 'UNKNOWN';
  }

  private async applyCard(
    page: Page,
    card: CardInput,
  ): Promise<CardUpdateMetadata> {
    this.logger.debug('Navigating to Paramount+ billing page');
    await page.goto('https://www.paramountplus.com/account/billing/', {
      waitUntil: 'domcontentloaded',
    });
    await retryAsync(
      async () => {
        await page.waitForSelector('input[name="cardNumber"]', {
          timeout: 5000,
        });
      },
      { retries: 5 },
    );

    await page.focus('input[name="cardNumber"]');
    this.logger.debug(
      `Entering card number (last4=${card.cardNumber.slice(-4)})`,
    );
    await page.keyboard.type(card.cardNumber, { delay: 10 });

    await retryAsync(
      async () => {
        await page.waitForSelector('input[name="expMonth"]', { timeout: 5000 });
      },
      { retries: 5 },
    );
    await page.focus('input[name="expMonth"]');
    await page.keyboard.type(String(card.expiryMonth).padStart(2, '0'), {
      delay: 10,
    });

    await retryAsync(
      async () => {
        await page.waitForSelector('input[name="expYear"]', { timeout: 5000 });
      },
      { retries: 5 },
    );
    await page.focus('input[name="expYear"]');
    await page.keyboard.type(String(card.expiryYear), { delay: 10 });

    await retryAsync(
      async () => {
        await page.waitForSelector('input[name="cvc"]', { timeout: 5000 });
      },
      { retries: 5 },
    );
    await page.focus('input[name="cvc"]');
    this.logger.debug('Entering CVC (redacted)');
    await page.keyboard.type(card.cvc, { delay: 10 });

    await retryAsync(
      async () => {
        await page.waitForSelector('input[name="nameOnCard"]', {
          timeout: 5000,
        });
      },
      { retries: 5 },
    );
    await page.focus('input[name="nameOnCard"]');
    await page.keyboard.type(card.nameOnCard, { delay: 10 });

    if (card.postalCode) {
      await retryAsync(
        async () => {
          await page.waitForSelector('input[name="postalCode"]', {
            timeout: 5000,
          });
        },
        { retries: 5 },
      );
      await page.focus('input[name="postalCode"]');
      await page.keyboard.type(card.postalCode, { delay: 10 });
    }

    await retryAsync(
      async () => {
        await Promise.all([
          page.click('button[type="submit"]'),
          page.waitForResponse(
            (res) => res.url().includes('/billing') && res.status() < 500,
            { timeout: 20000 },
          ),
        ]);
      },
      { retries: 3 },
    );
    this.logger.debug('Submitted billing form and received response');

    return {
      last4: card.cardNumber.slice(-4),
      brand: this.detectCardBrand(card.cardNumber),
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
    };
  }

  async updateCardForUser(
    userId: string,
    login: LoginArgs,
    card: CardInput,
  ): Promise<boolean> {
    const user = await this.usersService.findById(userId);
    let browser: Browser | null = null;
    let page: Page | null = null;
    const startTs = new Date();
    let step: 'LOGIN' | 'APPLY_CARD' | 'INIT' = 'INIT';
    try {
      this.logger.log(`Starting automation for userId=${userId}`);
      browser = await this.launchBrowser();
      page = await browser.newPage();
      await this.preparePage(page);
      step = 'LOGIN';
      await this.loginToParamount(page, login);
      step = 'APPLY_CARD';
      const metadata = await this.applyCard(page, card);
      await this.taskLogRepository.save({
        user,
        taskType: 'UPDATE_CARD',
        status: 'SUCCESS',
        message: 'Card updated successfully',
        metadata: { ...metadata, executedAt: startTs.toISOString() },
      });
      this.logger.log(
        `Automation SUCCESS for user ${user.email} (last4=${metadata.last4}, executedAt=${startTs.toISOString()})`,
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Automation failed for user ${user.email}: ${message}`);
      await this.taskLogRepository.save({
        user,
        taskType: 'UPDATE_CARD',
        status: 'FAILED',
        message,
        metadata: {
          executedAt: startTs.toISOString(),
          stepFailed: step,
          url: page ? page.url() : undefined,
        },
      });
      return false;
    } finally {
      if (page) {
        await page.close().catch(() => undefined);
      }
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }
}
