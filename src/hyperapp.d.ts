declare module 'hyperapp' {
    export type ActionResult<State, Props> = State | [State, EffectResult<State, Props>];

    export type Action<State, Props> = <ResultProps>(state: State, props: Props) => ActionResult<State, ResultProps>;

    export type Dispatch<State> = <Props>(action: Action<State, Props>, props: Props) => void;

    export type EffectResult<State, Props> = [(dispatch: Dispatch<State>, props: Props) => void, Props];

    export type VNode = {};

    export function app<State>(props: { init?: () => State, view?: (state: State) => VNode | VNode[] | string | string[], node: Node }): void;

    export function h(name: string, props: { [key: string]: any }, children?: VNode | string | (VNode | string)[]): VNode;
}