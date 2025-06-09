export abstract class Example {
    abstract buildHtmlNodes(): void;

    abstract run(): void | Promise<void>;

    abstract print(): void | Promise<void>;
}