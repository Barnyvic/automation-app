import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { TaskLog } from './entities/task-log.entity';
import { CardInput } from './dto/card.input';
import { retryAsync } from '../common/utils/retry.util';
import puppeteer, { Browser, Page, Frame } from 'puppeteer-core';

type LoginArgs = { email: string; password: string };

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
    return puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  private async loginToParamount(page: Page, args: LoginArgs): Promise<void> {
    // Start from homepage then navigate to sign-in for better reliability
    this.logger.debug('Opening Paramount+ homepage');
    await page.goto('https://www.paramountplus.com/', {
      waitUntil: 'domcontentloaded',
    });
    await this.acceptCookieBanner(page).catch(() => undefined);

    // Try to click SIGN IN entrypoint; if not found, fall back to account page
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

    // Try to accept common cookie banners (OneTrust) if present
    await this.acceptCookieBanner(page).catch(() => undefined);

    await retryAsync(
      async () => {
        await page.waitForSelector('input[name="email"]', { timeout: 5000 });
      },
      { retries: 5 },
    );
    // Password may appear after continuing from email; try wait, otherwise try Continue/Next then wait again
    let passwordVisible = false;
    try {
      await page.waitForSelector('input[name="password"]', { timeout: 5000 });
      passwordVisible = true;
    } catch (_) {
      this.logger.debug(
        'Password not visible yet; attempting to continue after email',
      );
    }

    // Some pages lazy render or nest fields inside iframes; find robustly
    const emailCtx = await this.findFieldContext(page, [
      'input[name="email"]',
      'input#email',
      'input[type="email"]',
    ]);
    let passwordCtx: { context: Page | Frame; selector: string } | null = null;
    if (!passwordVisible) {
      // Try a two-step flow: click Continue/Next after typing email to reveal password
      await emailCtx.context.type(emailCtx.selector, args.email, { delay: 20 });
      const continued =
        (await this.clickByText(
          emailCtx.context as Page | Frame,
          'button, [role="button"]',
          ['continue', 'next', 'sign in'],
        ).catch(() => false)) || false;
      if (continued) {
        await page
          .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
          .catch(() => undefined);
      }
      // Wait again for password
      await retryAsync(
        async () => {
          // Find password in any context (page or frames)
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
    // Ensure email is filled (if not already)
    const emailValue = await (emailCtx.context as Page | Frame)
      .$eval(
        emailCtx.selector,
        (el: any) => (el as HTMLInputElement).value || '',
      )
      .catch(() => '');
    if (!emailValue) {
      await emailCtx.context.type(emailCtx.selector, args.email, { delay: 20 });
    }
    await passwordCtx.context.type(passwordCtx.selector, args.password, {
      delay: 20,
    });

    await retryAsync(
      async () => {
        // Click submit (try several common variants) from the same context as fields (frame or page)
        const ctx = passwordCtx!.context as Page | Frame;
        const clickedSubmit =
          (await ctx
            .$('button[type="submit"]')
            .then(async (h) => (h ? (await h.click(), true) : false))) ||
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
    // OneTrust default accept button id
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
    // Try on the main page first
    for (const selector of selectors) {
      const found = await page
        .waitForSelector(selector, { timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (found) {
        return { context: page, selector };
      }
    }
    // Then try all frames
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
    // As a last resort, extend timeout on main page for the last selector
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

  private async applyCard(
    page: Page,
    card: CardInput,
  ): Promise<Record<string, unknown>> {
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
      brand: 'UNKNOWN',
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
