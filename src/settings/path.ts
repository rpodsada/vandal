// Typed dot-paths into a settings object, e.g. "save.directory".
//
// `Path<T>` is every leaf path of T; `PathValue<T, P>` is the type at that
// path; `PathOf<T, V>` is the leaf paths whose value is V. This lets the
// settings schema say "a toggle must point at a boolean" and have TypeScript
// enforce it.

type Leaf = string | number | boolean | null | undefined | readonly unknown[];

export type Path<T> = T extends Leaf
  ? never
  : {
      [K in keyof T & string]: T[K] extends Leaf ? K : `${K}.${Path<T[K]>}`;
    }[keyof T & string];

export type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? PathValue<T[K], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/** Leaf paths whose value is assignable to V. */
export type PathOf<T, V> = {
  [P in Path<T>]: PathValue<T, P> extends V ? P : never;
}[Path<T>];

export function getIn<T, P extends Path<T>>(obj: T, path: P): PathValue<T, P> {
  let cur: unknown = obj;
  for (const key of path.split(".")) cur = (cur as Record<string, unknown>)[key];
  return cur as PathValue<T, P>;
}

/** Immutable update: copies each object along the path. */
export function setIn<T, P extends Path<T>>(obj: T, path: P, value: PathValue<T, P>): T {
  const [head, ...rest] = path.split(".");
  const current = obj as Record<string, unknown>;
  return {
    ...current,
    [head]:
      rest.length === 0
        ? value
        : setIn(current[head] as never, rest.join(".") as never, value as never),
  } as T;
}
