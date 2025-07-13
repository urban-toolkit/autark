export class NonSelectQueryError extends Error {
  constructor() {
    super('Only SELECT queries are allowed for raw queries.');
    this.name = 'NonSelectQueryError';
  }
}
