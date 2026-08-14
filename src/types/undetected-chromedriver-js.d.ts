declare module "undetected-chromedriver-js" {
  import type { WebDriver } from "selenium-webdriver";

  export interface UndetectedChromeOptions {
    headless?: boolean;
    userAgent?: string;
    windowSize?: {
      width: number;
      height: number;
    };
    chromePath?: string;
    driverPath?: string;
    arguments?: string[];
  }

  export default class UndetectedChrome {
    constructor(options?: UndetectedChromeOptions);
    build(): Promise<WebDriver>;
    quit(): Promise<void>;
    getDriver(): WebDriver;
    static create(options?: UndetectedChromeOptions): Promise<UndetectedChrome>;
  }
}
