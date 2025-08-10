import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { TaskLog } from './entities/task-log.entity';
import { CardInput } from './dto/card.input';
import { retryAsync } from '../common/utils/retry.util';
import puppeteer, { Browser, Page } from 'puppeteer-core';

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
    return puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  private async loginToParamount(page: Page, args: LoginArgs): Promise<void> {
    await page.goto('https://www.paramountplus.com/account/', {
      waitUntil: 'domcontentloaded',
    });

    await retryAsync(
      async () => {
        await page.waitForSelector('input[name="email"]', { timeout: 5000 });
      },
      { retries: 5 },
    );
    await retryAsync(
      async () => {
        await page.waitForSelector('input[name="password"]', { timeout: 5000 });
      },
      { retries: 5 },
    );

    await page.type('input[name="email"]', args.email, { delay: 20 });
    await page.type('input[name="password"]', args.password, { delay: 20 });

    await retryAsync(
      async () => {
        await Promise.all([
          page.click('button[type="submit"]'),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
        ]);
      },
      { retries: 3 },
    );
  }

  private async applyCard(
    page: Page,
    card: CardInput,
  ): Promise<Record<string, unknown>> {
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
