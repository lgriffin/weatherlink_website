declare const __brand: unique symbol;
export type Branded<T, Brand extends string> = T & { readonly [__brand]: Brand };
