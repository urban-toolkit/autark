const world = 'world';

export function hello(who: any = world): string {
  return `Hello ${who}! `;
}