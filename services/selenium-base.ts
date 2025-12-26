/**
 * Selenium Base Service
 * Provides common functionality for browser automation
 * Used by Medium and Quora integrations
 */

import { Builder, WebDriver, By, until, WebElement } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import firefox from 'selenium-webdriver/firefox';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

export interface SeleniumConfig {
  headless?: boolean;
  browser?: 'chrome' | 'firefox';
  timeout?: number;
  windowSize?: { width: number; height: number };
}

export interface LoginCredentials {
  email: string;
  password?: string;
  cookies?: Array<{ 
    name: string; 
    value: string; 
    domain?: string; 
    path?: string; 
    secure?: boolean; 
    httpOnly?: boolean;
    // Cookie-Editor format fields (optional)
    expirationDate?: number;
    hostOnly?: boolean;
    sameSite?: string;
    session?: boolean;
    storeId?: any;
  }>;
}

export interface PublishContent {
  title: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface PublishResult {
  success: boolean;
  url?: string;
  error?: string;
  screenshot?: string; // Base64 encoded screenshot for debugging
}

/**
 * Base Selenium Service
 * Handles WebDriver initialization and common operations
 */
export class SeleniumBaseService {
  protected driver: WebDriver | null = null;
  protected config: SeleniumConfig;

  constructor(config: SeleniumConfig = {}) {
    this.config = {
      headless: true,
      browser: 'chrome',
      timeout: 30000,
      windowSize: { width: 1920, height: 1080 },
      ...config,
    };
  }

  /**
   * Find ChromeDriver path
   */
  private findChromeDriverPath(): string | null {
    // Get project root - try multiple methods
    let projectRoot = process.cwd();
    
    // If we're in .next directory, go up to project root
    if (projectRoot.includes('.next')) {
      projectRoot = path.resolve(projectRoot, '../..');
    }
    
    // Try to find package.json to confirm project root
    let currentDir = process.cwd();
    for (let i = 0; i < 5; i++) {
      const packageJsonPath = path.join(currentDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        projectRoot = currentDir;
        break;
      }
      currentDir = path.resolve(currentDir, '..');
    }
    
    // Try common locations (prioritize node_modules first)
    // Note: The actual binary is in lib/chromedriver/, not bin/
    const possiblePaths: string[] = [
      process.env.CHROMEDRIVER_PATH,
      path.join(projectRoot, 'node_modules', 'chromedriver', 'lib', 'chromedriver', 'chromedriver'),
      path.join(projectRoot, 'node_modules', 'chromedriver', 'bin', 'chromedriver'),
      path.join(projectRoot, 'node_modules', '.bin', 'chromedriver'),
      path.join(process.cwd(), 'node_modules', 'chromedriver', 'lib', 'chromedriver', 'chromedriver'),
      path.join(process.cwd(), 'node_modules', 'chromedriver', 'bin', 'chromedriver'),
      path.join(process.cwd(), 'node_modules', '.bin', 'chromedriver'),
      '/usr/local/bin/chromedriver',
      '/opt/homebrew/bin/chromedriver',
      '/usr/bin/chromedriver',
      path.join(projectRoot, 'chromedriver'),
    ].filter(Boolean) as string[];

    // Also try which/where command
    try {
      const whichPath = execSync('which chromedriver', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (whichPath && whichPath.length > 0) {
        possiblePaths.unshift(whichPath);
      }
    } catch (e) {
      // which command failed, continue with other paths
    }

    // Check if any path exists and resolve symlinks
    for (const driverPath of possiblePaths) {
      try {
        if (!fs.existsSync(driverPath)) {
          continue;
        }
        
        let resolvedPath = driverPath;
        
        // Resolve symlinks
        try {
          const stats = fs.lstatSync(driverPath);
          if (stats.isSymbolicLink()) {
            resolvedPath = fs.readlinkSync(driverPath);
            if (!path.isAbsolute(resolvedPath)) {
              resolvedPath = path.resolve(path.dirname(driverPath), resolvedPath);
            }
          }
        } catch (e) {
          // Symlink resolution failed, use original path
          resolvedPath = driverPath;
        }
        
        if (fs.existsSync(resolvedPath)) {
          // Make sure it's an absolute path
          const absolutePath = path.isAbsolute(resolvedPath) 
            ? resolvedPath 
            : path.resolve(resolvedPath);
          
          // Check if it's executable
          try {
            fs.accessSync(absolutePath, fs.constants.X_OK);
            return absolutePath;
          } catch (e) {
            // Not executable, but exists - might still work
            return absolutePath;
          }
        }
      } catch (e) {
        // Continue checking other paths
      }
    }

    return null;
  }

  /**
   * Initialize WebDriver
   * Supports both local ChromeDriver and remote Railway Selenium Hub
   */
  async initialize(): Promise<void> {
    try {
      // Check if Railway Selenium Hub URL is configured
      const seleniumHubUrl = process.env.SELENIUM_HUB_URL;
      
      if (this.config.browser === 'chrome') {
        const options = new chrome.Options();
        
        if (this.config.headless) {
          options.addArguments('--headless=new'); // New headless mode
        }
        
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--disable-gpu');
        options.addArguments('--disable-blink-features=AutomationControlled');
        options.addArguments('--disable-features=IsolateOrigins,site-per-process');
        options.addArguments(`--window-size=${this.config.windowSize?.width},${this.config.windowSize?.height}`);
        
        // User agent to avoid detection
        options.addArguments('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Exclude automation flags (using addArguments instead of setExcludeSwitches)
        options.addArguments('--exclude-switches=enable-automation');
        
        const builder = new Builder()
          .forBrowser('chrome')
          .setChromeOptions(options);
        
        // If Railway Selenium Hub URL is provided, connect to it (remote)
        if (seleniumHubUrl) {
          console.log('🔗 Connecting to Railway Selenium Hub...');
          console.log(`   URL: ${seleniumHubUrl}`);
          console.log('⏳ Note: If Railway is sleeping, this may take 30-60 seconds to wake up...');
          
          builder.usingServer(seleniumHubUrl);
          
          try {
            // Set longer timeout for Railway wake-up (2 minutes)
            const startTime = Date.now();
            this.driver = await builder.build();
            const connectionTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ Connected to Railway Selenium Hub in ${connectionTime}s`);
          } catch (railwayError: any) {
            const errorMessage = railwayError.message || 'Unknown error';
            console.error('❌ Failed to connect to Railway Selenium Hub:', errorMessage);
            
            if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('timeout')) {
              throw new Error(
                `Failed to connect to Railway Selenium Hub: ${errorMessage}\n\n` +
                `Possible causes:\n` +
                `  1. Railway service is not running or still waking up\n` +
                `  2. Railway URL is incorrect: ${seleniumHubUrl}\n` +
                `  3. Railway service hasn't finished deploying\n\n` +
                `Try again in 30-60 seconds, or check Railway dashboard.`
              );
            }
            throw railwayError;
          }
        } else {
          // Local mode - use local ChromeDriver
          console.log('🖥️ Using local ChromeDriver (no SELENIUM_HUB_URL found)');
          
          // Try to find ChromeDriver and set service
          const driverPath = this.findChromeDriverPath();
        
        if (driverPath) {
          console.log('✅ Using ChromeDriver at:', driverPath);
          try {
            // Use absolute path
            const absoluteDriverPath = path.isAbsolute(driverPath) 
              ? driverPath 
              : path.resolve(driverPath);
            
            const service = new chrome.ServiceBuilder(absoluteDriverPath);
            builder.setChromeService(service);
            console.log('✅ ChromeService configured successfully');
          } catch (serviceError: any) {
            console.warn('⚠️ Failed to create ChromeService:', serviceError.message);
            console.warn('Continuing without explicit service - Selenium Manager will try to find driver');
          }
        } else {
          console.warn('⚠️ ChromeDriver not found in common locations.');
          console.warn('Searched paths:', [
            process.env.CHROMEDRIVER_PATH,
            'node_modules/chromedriver/bin/chromedriver',
            '/usr/local/bin/chromedriver',
            '/opt/homebrew/bin/chromedriver',
          ].filter(Boolean).join(', '));
            console.warn('');
            console.warn('💡 TIP: Set SELENIUM_HUB_URL in .env.local to use Railway Selenium Hub');
          console.warn('');
          console.warn('Attempting to use Selenium Manager (may download driver automatically)...');
          console.warn('');
          console.warn('If this fails, please:');
          console.warn('  1. Install: npm install --save-dev chromedriver');
          console.warn('  2. Or: brew install chromedriver');
          console.warn('  3. Or set CHROMEDRIVER_PATH=/path/to/chromedriver in .env.local');
            console.warn('  4. Or set SELENIUM_HUB_URL to use Railway Selenium Hub');
        }
        
        try {
          this.driver = await builder.build();
            console.log('✅ WebDriver initialized successfully (local)');
        } catch (buildError: any) {
          const errorMessage = buildError.message || 'Unknown error';
          console.error('❌ Failed to build WebDriver:', errorMessage);
          
          // Provide helpful error message
          if (errorMessage.includes('Unable to obtain') || errorMessage.includes('driver')) {
            throw new Error(
              `Failed to initialize WebDriver: ${errorMessage}\n\n` +
              `Please install ChromeDriver:\n` +
              `  macOS: brew install chromedriver\n` +
              `  Or: npm install --save-dev chromedriver\n` +
                `  Or set CHROMEDRIVER_PATH=/path/to/chromedriver\n` +
                `  Or set SELENIUM_HUB_URL to use Railway Selenium Hub\n\n` +
              `After installing, make sure ChromeDriver is in your PATH or set CHROMEDRIVER_PATH.`
            );
          }
          throw buildError;
          }
        }
      } else {
        const options = new firefox.Options();
        
        if (this.config.headless) {
          options.addArguments('--headless');
        }
        
        this.driver = await new Builder()
          .forBrowser('firefox')
          .setFirefoxOptions(options)
          .build();
      }

      // Set timeouts
      if (this.driver) {
        await this.driver.manage().setTimeouts({
          implicit: this.config.timeout,
          pageLoad: this.config.timeout! * 2,
          script: this.config.timeout! * 2,
        });
      }
    } catch (error: any) {
      throw new Error(`Failed to initialize WebDriver: ${error.message}`);
    }
  }

  /**
   * Navigate to URL
   */
  async navigateTo(url: string): Promise<void> {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }
    
    // Set a longer page load timeout for slow sites like Medium
    const pageLoadTimeout = 60000; // 60 seconds for slow sites
    await this.driver.manage().setTimeouts({ pageLoad: pageLoadTimeout });
    
    try {
      await this.driver.get(url);
      await this.humanDelay(1000, 2000);
    } catch (error: any) {
      // If page load times out, check if we're at least on the right domain
      if (error.message?.includes('timeout') || error.message?.includes('Timed out')) {
        const currentUrl = await this.driver.getCurrentUrl();
        if (currentUrl.includes(new URL(url).hostname)) {
          console.warn(`⚠️ Page load timeout but we're on the right domain: ${currentUrl}`);
          // Continue anyway - page might have partially loaded
          return;
        }
      }
      throw error;
    }
  }

  /**
   * Get WebDriver instance (public for integrations)
   */
  getDriver(): WebDriver {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }
    return this.driver;
  }

  /**
   * Login using credentials or cookies
   */
  async login(credentials: LoginCredentials, loginUrl: string): Promise<void> {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }

    // If cookies provided, use them
    if (credentials.cookies && credentials.cookies.length > 0) {
      await this.navigateTo(loginUrl);
      await this.humanDelay(1000, 2000);
      
      // Add cookies
      for (const cookie of credentials.cookies) {
        try {
          await this.driver.manage().addCookie({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
          });
        } catch (error) {
          console.warn(`Failed to add cookie ${cookie.name}:`, error);
        }
      }
      
      // Refresh page to apply cookies
      await this.driver.navigate().refresh();
      await this.humanDelay(2000, 3000);
      return;
    }

    // Otherwise, use email/password login
    if (!credentials.email || !credentials.password) {
      throw new Error('Either cookies or email/password required');
    }

    await this.navigateTo(loginUrl);
    await this.humanDelay(1000, 2000);

    // Wait for login form
    // Platform-specific implementations will override this
    throw new Error('Login with email/password must be implemented by platform-specific service');
  }

  /**
   * Fill input field
   */
  async fillInput(selector: string, value: string, options?: { by?: 'id' | 'name' | 'xpath' | 'css' }): Promise<void> {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }

    const by = this.getBy(selector, options?.by || 'css');
    const element = await this.driver.wait(until.elementLocated(by), this.config.timeout);
    
    // Clear existing value
    await element.clear();
    await this.humanDelay(200, 500);
    
    // Type with human-like delays
    for (const char of value) {
      await element.sendKeys(char);
      await this.humanDelay(50, 150); // Random delay between keystrokes
    }
    
    await this.humanDelay(500, 1000);
  }

  /**
   * Click element
   */
  async clickElement(selector: string, options?: { by?: 'id' | 'name' | 'xpath' | 'css'; waitForVisible?: boolean }): Promise<void> {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }

    const by = this.getBy(selector, options?.by || 'css');
    let element: WebElement;

    if (options?.waitForVisible) {
      element = await this.driver.wait(until.elementIsVisible(await this.driver.findElement(by)), this.config.timeout);
    } else {
      element = await this.driver.wait(until.elementLocated(by), this.config.timeout);
    }

    // Scroll into view
    await this.driver.executeScript('arguments[0].scrollIntoView(true);', element);
    await this.humanDelay(300, 600);

    // Click
    await element.click();
    await this.humanDelay(1000, 2000);
  }

  /**
   * Wait for element
   */
  async waitForElement(selector: string, timeout?: number): Promise<WebElement> {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }

    const by = this.getBy(selector, 'css');
    return await this.driver.wait(until.elementLocated(by), timeout || this.config.timeout);
  }

  /**
   * Get element text
   */
  async getElementText(selector: string): Promise<string> {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }

    const element = await this.waitForElement(selector);
    return await element.getText();
  }

  /**
   * Get current URL
   */
  async getCurrentUrl(): Promise<string> {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }
    return await this.driver.getCurrentUrl();
  }

  /**
   * Take screenshot (for debugging)
   */
  async takeScreenshot(): Promise<string> {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }
    const screenshot = await this.driver.takeScreenshot();
    return screenshot;
  }

  /**
   * Human-like delay
   */
  async humanDelay(min: number = 500, max: number = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Get By selector
   */
  protected getBy(selector: string, type: 'id' | 'name' | 'xpath' | 'css'): By {
    switch (type) {
      case 'id':
        return By.id(selector);
      case 'name':
        return By.name(selector);
      case 'xpath':
        return By.xpath(selector);
      case 'css':
      default:
        return By.css(selector);
    }
  }

  /**
   * Check if element exists
   */
  async elementExists(selector: string): Promise<boolean> {
    if (!this.driver) {
      return false;
    }

    try {
      await this.driver.findElement(By.css(selector));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for URL to contain text
   */
  async waitForUrl(urlPattern: string | RegExp, timeout?: number): Promise<void> {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }

    const pattern = typeof urlPattern === 'string' ? new RegExp(urlPattern) : urlPattern;
    
    await this.driver.wait(async () => {
      const currentUrl = await this.driver!.getCurrentUrl();
      return pattern.test(currentUrl);
    }, timeout || this.config.timeout);
  }

  /**
   * Execute JavaScript
   */
  async executeScript(script: string, ...args: any[]): Promise<any> {
    if (!this.driver) {
      throw new Error('WebDriver not initialized');
    }
    return await this.driver.executeScript(script, ...args);
  }

  /**
   * Find elements with JavaScript using retry/timeout mechanism
   * Retries multiple times until element is found or timeout is reached
   */
  async findElementsWithRetry(
    findFunction: () => Promise<any>,
    options: {
      timeout?: number; // Total timeout in milliseconds
      interval?: number; // Interval between retries in milliseconds
      maxRetries?: number; // Maximum number of retries
      description?: string; // Description for logging
    } = {}
  ): Promise<any> {
    const {
      timeout = 30000, // 30 seconds default
      interval = 1000, // 1 second between retries
      maxRetries = 30, // 30 retries max
      description = 'element'
    } = options;

    const startTime = Date.now();
    let lastError: any = null;
    let attempt = 0;

    console.log(`🔍 Starting retry session to find ${description} (timeout: ${timeout}ms, interval: ${interval}ms, max retries: ${maxRetries})`);

    while (attempt < maxRetries) {
      attempt++;
      const elapsed = Date.now() - startTime;

      // Check if timeout exceeded
      if (elapsed >= timeout) {
        console.warn(`⏱️ Timeout reached (${elapsed}ms) while finding ${description} after ${attempt} attempts`);
        throw new Error(`Timeout finding ${description} after ${elapsed}ms (${attempt} attempts). Last error: ${lastError?.message || 'Unknown'}`);
      }

      try {
        const result = await findFunction();
        
        // If result is truthy (element found, button clicked, etc.)
        if (result) {
          const elapsed = Date.now() - startTime;
          console.log(`✅ Found ${description} after ${elapsed}ms (${attempt} attempts)`);
          return result;
        }
      } catch (error: any) {
        lastError = error;
        // Don't log every attempt to avoid spam, only log every 5th attempt
        if (attempt % 5 === 0) {
          console.log(`⏳ Attempt ${attempt}/${maxRetries} to find ${description} failed: ${error.message || error}`);
        }
      }

      // Wait before next retry
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    const elapsed = Date.now() - startTime;
    console.error(`❌ Failed to find ${description} after ${elapsed}ms (${attempt} attempts)`);
    throw new Error(`Failed to find ${description} after ${elapsed}ms (${attempt} attempts). Last error: ${lastError?.message || 'Unknown'}`);
  }

  /**
   * Find all JavaScript elements on page with detailed information
   * Useful for debugging selector issues
   */
  async findAllElementsWithTimeout(
    options: {
      timeout?: number;
      interval?: number;
      includeHidden?: boolean;
      elementTypes?: string[];
    } = {}
  ): Promise<{
    buttons: Array<{
      text: string;
      ariaLabel: string;
      className: string;
      id: string;
      visible: boolean;
      disabled: boolean;
      inModal: boolean;
      tagName: string;
    }>;
    inputs: Array<{
      placeholder: string;
      type: string;
      className: string;
      id: string;
      visible: boolean;
      tagName: string;
    }>;
    links: Array<{
      text: string;
      href: string;
      className: string;
      id: string;
      visible: boolean;
    }>;
    modals: Array<{
      className: string;
      id: string;
      visible: boolean;
      role: string;
    }>;
    timestamp: number;
  }> {
    const {
      timeout = 10000,
      interval = 500,
      includeHidden = false,
      elementTypes = ['button', 'input', 'link', 'modal']
    } = options;

    return await this.findElementsWithRetry(
      async () => {
        return await this.executeScript(`
          const includeHidden = arguments[0];
          const elementTypes = arguments[1];
          
          const result = {
            buttons: [],
            inputs: [],
            links: [],
            modals: [],
            timestamp: Date.now()
          };
          
          // Find all modals first (to check if elements are in modals)
          const allModals = Array.from(document.querySelectorAll(
            '[role="dialog"], .overlay, [class*="modal"], [class*="Modal"], [class*="publish"], [class*="Publish"]'
          ));
          
          const modals = allModals.map(modal => {
            const style = window.getComputedStyle(modal);
            return {
              className: modal.className || '',
              id: modal.id || '',
              visible: includeHidden || (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'),
              role: modal.getAttribute('role') || ''
            };
          });
          
          result.modals = modals;
          
          // Find all buttons
          if (elementTypes.includes('button')) {
            const buttons = Array.from(document.querySelectorAll('button, [role="button"], a[role="button"]'));
            result.buttons = buttons.map(btn => {
              const style = window.getComputedStyle(btn);
              const modal = btn.closest('[role="dialog"], .overlay, [class*="modal"], [class*="Modal"]');
              
              return {
                text: (btn.textContent || '').trim(),
                ariaLabel: btn.getAttribute('aria-label') || '',
                className: btn.className || '',
                id: btn.id || '',
                visible: includeHidden || (btn.offsetParent !== null && style.display !== 'none'),
                disabled: btn.disabled,
                inModal: modal !== null,
                tagName: btn.tagName.toLowerCase()
              };
            });
          }
          
          // Find all inputs
          if (elementTypes.includes('input')) {
            const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
            result.inputs = inputs.map(input => {
              const style = window.getComputedStyle(input);
              
              return {
                placeholder: input.getAttribute('placeholder') || '',
                type: input.type || (input.contentEditable === 'true' ? 'contenteditable' : input.tagName.toLowerCase()),
                className: input.className || '',
                id: input.id || '',
                visible: includeHidden || (input.offsetParent !== null && style.display !== 'none'),
                tagName: input.tagName.toLowerCase()
              };
            });
          }
          
          // Find all links
          if (elementTypes.includes('link')) {
            const links = Array.from(document.querySelectorAll('a[href]'));
            result.links = links.map(link => {
              const style = window.getComputedStyle(link);
              
              return {
                text: (link.textContent || '').trim(),
                href: link.getAttribute('href') || '',
                className: link.className || '',
                id: link.id || '',
                visible: includeHidden || (link.offsetParent !== null && style.display !== 'none')
              };
            });
          }
          
          return result;
        `, includeHidden, elementTypes);
      },
      {
        timeout,
        interval,
        maxRetries: Math.ceil(timeout / interval),
        description: 'all page elements'
      }
    );
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.quit();
      this.driver = null;
    }
  }

  /**
   * Cleanup (always call this in finally block)
   */
  async cleanup(): Promise<void> {
    try {
      await this.close();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

