export abstract class Example {
    abstract buildHtml(): void;

    abstract run(): void | Promise<void>;
}