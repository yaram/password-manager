declare module 'hyperapp-fx' {
    import { Action, EffectResult } from 'hyperapp';

    export type HttpProps<State> =
        { url: string, options?: RequestInit, response?: 'json', action?: Action<State, any>, error?: Action<State, any> } |
        { url: string, options?: RequestInit, response?: 'text', action?: Action<State, string>, error?: Action<State, any> }
    ;

    export function Http<State>(props: HttpProps<State>): EffectResult<State, HttpProps<State>>;
}