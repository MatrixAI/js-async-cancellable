import type { ContextFunctionCheck } from '@matrixai/contexts/functions/index.js';

type ContextAt<
  Args extends unknown[],
  Position extends number | 'last',
> = Position extends 'last'
  ? Args extends [...unknown[], infer Last]
    ? Last
    : never
  : Position extends number
    ? Args[Position]
    : never;

type IncompatibleSignal<Context> = Context extends unknown
  ? Context extends { signal?: infer Signal }
    ? AbortSignal extends NonNullable<Signal>
      ? never
      : Context
    : never
  : never;

type CancellationFunctionCheck<
  Args extends unknown[],
  Position extends number | 'last',
> = ContextFunctionCheck<Args, Position, ContextAt<Args, Position>> &
  ([ContextAt<Args, Position>] extends [object]
    ? [IncompatibleSignal<ContextAt<Args, Position>>] extends [never]
      ? unknown
      : never
    : never);

export type { CancellationFunctionCheck };
