declare module "mailparser" {
  export function simpleParser(
    source: Buffer | string,
  ): Promise<{ html?: string | Buffer; text?: string }>;
}
