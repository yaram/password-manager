import { h, app, Dispatch, ActionResult } from 'hyperapp';
import { Http, HttpProps } from 'hyperapp-fx';
import nacl from 'tweetnacl';
import { keccak256 } from 'js-sha3';
import { ec } from 'elliptic';
import { Buffer } from 'buffer';
import * as url from 'url';

const scryptWorker = new Worker('scryptWorker.ts');

const bzzUrl = 'https://swarm-gateways.net';

const feedTopic = 'password-manager';

const curve = new ec('secp256k1');

export interface LoginInfo {
    name: string,
    username: string,
    password: string
}

interface PersistedInfo {
    logins: { [id: string]: LoginInfo },
    nextLoginID: number
}

interface State {
    state: 'password' | 'logins',
    username: string,
    password: string,
    key: Buffer | null,
    feedKeyPair: ec.KeyPair | null,
    message: string | null,
    logins: { [id: string]: { info: LoginInfo, isPasswordVisible: boolean } },
    nextLoginID: number,
    persisting: boolean
}

function decryptLogins(state: State, info: string, nonce: string): State {
    const infoJSON = nacl.secretbox.open(new Uint8Array(Buffer.from(info, 'base64').buffer), new Uint8Array(Buffer.from(nonce, 'base64').buffer), new Uint8Array((state.key as Buffer).buffer));
    
    if(infoJSON !== null) {
        const info: PersistedInfo = JSON.parse(Buffer.from(infoJSON).toString('utf8'));

        return {
            ...state,
            state: 'logins',
            message: null,
            logins: Object.fromEntries(Object.entries(info.logins).map(([key, value]) => [key, { info: value, isPasswordVisible: false }])),
            nextLoginID: info.nextLoginID
        };
    } else {
        return {
            ...state,
            message: 'Incorrect username or password'
        };
    }
}

function submitPassword(state: State): ActionResult<State, Buffer> {
    if(state.username.length === 0) {
        return { ...state, message: 'Please enter a username' };
    }

    if(state.password.length === 0) {
        return { ...state, message: 'Please enter a password' };
    }

    scryptWorker.postMessage({ key: state.password, salt: `${state.username}@password-manager` });

    return [
        {
            ...state,
            message: 'Loading...'
        },
        [
            (dispatch: Dispatch<State>) => {
                function eventListener(e: MessageEvent) {
                    dispatch((state, keyText): ActionResult<State, any> => {
                        const key = Buffer.from(keyText, 'base64');

                        const feedKeyPair = curve.keyFromPrivate(key);

                        const feedPublicKey = keccak256.arrayBuffer(feedKeyPair.getPublic().encode().slice(1)).slice(-20);

                        const user = '0x' + Buffer.from(feedPublicKey).toString('hex');

                        const topicBytes = Buffer.alloc(32);

                        topicBytes.write(feedTopic);

                        const topic = '0x' + topicBytes.toString('hex');

                        return [
                            {
                                ...state,
                                message: 'Loading...',
                                key,
                                feedKeyPair
                            },
                            Http<State>({ url: `${url.resolve(bzzUrl, '/bzz-feed:/')}?user=${user}&topic=${topic}`, response: 'json', action: (state, persistedData) => {
                                return decryptLogins(state, persistedData.info, persistedData.nonce);
                            }, error: (state, _error) => {
                                const persistedDataJSON = localStorage.getItem('data-' + state.username);

                                if(persistedDataJSON !== null) {
                                    const result = window.confirm('Unable to read logins from Swarm. Do you want to use the local cache instead?');

                                    if(!result) {
                                        return {
                                            ...state,
                                            message: null
                                        };
                                    }

                                    const persistedData = JSON.parse(persistedDataJSON);

                                    return decryptLogins(state, persistedData.info, persistedData.nonce);
                                } else {
                                    const result = window.confirm('No saved logins exist with that username and password. Do you want to create a new one?');

                                    if(result) {
                                        return {
                                            ...state,
                                            state: 'logins',
                                            message: null
                                        };
                                    } else {
                                        return {
                                            ...state,
                                            message: null
                                        };
                                    }
                                }
                            } })
                        ];
                    }, e.data as string);
                }

                scryptWorker.addEventListener('message', eventListener);
            },
            undefined
        ]
    ];
}

function persistLogins(state: State) {
    if(state.persisting) {
        return { ...state };
    }

    const info: PersistedInfo = {
        logins: Object.fromEntries(Object.entries(state.logins).map(([key, value]) => [key, value.info])),
        nextLoginID: state.nextLoginID
    };

    const infoJSON = JSON.stringify(info);

    const nonce = new Buffer(nacl.randomBytes(nacl.secretbox.nonceLength));

    const infoEncrypted = Buffer.from(nacl.secretbox(new Uint8Array(Buffer.from(infoJSON).buffer), new Uint8Array(nonce.buffer), new Uint8Array((state.key as Buffer).buffer)));

    const persistedData = {
        nonce: nonce.toString('base64'),
        info: infoEncrypted.toString('base64')
    };

    const persistedDataJSON = JSON.stringify(persistedData);

    localStorage.setItem('data-' + state.username, persistedDataJSON);

    const feedKeyPair = state.feedKeyPair as ec.KeyPair;

    const feedPublicKey = keccak256.arrayBuffer(feedKeyPair.getPublic().encode().slice(1)).slice(-20);

    const user = '0x' + Buffer.from(feedPublicKey).toString('hex');

    const topicBytes = Buffer.alloc(32);

    topicBytes.write(feedTopic);

    const topic = '0x' + topicBytes.toString('hex');

    return [
        {
            ...state,
            message: 'Saving...',
            persisting: true
        },
        Http({ url: `${url.resolve(bzzUrl, '/bzz-feed:/')}?user=${user}&topic=${topic}&meta=1`, response: 'json', action: (state, feedTemplate) => {
            const levelBuffer = Buffer.alloc(1);

            levelBuffer.writeUInt8(feedTemplate.epoch.level, 0);

            const timeBuffer = Buffer.alloc(7);

            timeBuffer.writeUInt32LE(feedTemplate.epoch.time, 0);

            const digest = Buffer.concat([
                Buffer.from(new Uint8Array([feedTemplate.protocolVersion])),
                Buffer.alloc(7),
                topicBytes,
                Buffer.from(feedPublicKey),
                timeBuffer,
                levelBuffer,
                Buffer.from(persistedDataJSON)
            ]);

            const digestHash = Buffer.from(keccak256.arrayBuffer(digest));

            const signatureParts = curve.sign(digestHash, feedKeyPair, { pers: undefined, canonical: true });

            const signature =  Buffer.from([
                ...signatureParts.r.toArray('be', 32),
                ...signatureParts.s.toArray('be', 32),
                signatureParts.recoveryParam as number
            ]);

            return [
                { ...state },
                Http({
                    url: `${url.resolve(bzzUrl, '/bzz-feed:/')}?topic=${topic}&user=${user}&level=${feedTemplate.epoch.level}&time=${feedTemplate.epoch.time}&signature=0x${signature.toString('hex')}`,
                    response: 'text',
                    options: {
                        method: 'POST',
                        body: persistedDataJSON
                    },
                    action: (state, _text) => ({
                        ...state,
                        message: null,
                        persisting: false
                    }),
                    error: (state, error) => ({
                        ...state,
                        message: `Unable to save logins to Swarm (${error})`,
                        persisting: false
                    }),
                })
            ];
        }, error: (state, error) => {
            return {
                ...state,
                message: `Unable to save logins to Swarm (${error})`,
                persisting: false
            };
        } })
    ];
}

function addNewLogin(state: State) {
    const id = state.nextLoginID.toString();

    return persistLogins(
        {
            ...state,
            logins: { ...state.logins, [id]: { info: { name: '', username: '', password: '' }, isPasswordVisible: false } },
            nextLoginID: state.nextLoginID + 1
        }
    );
}

function onLoginInputKeyDown(state: State, e: KeyboardEvent) {
    if(e.keyCode === 13) {
        (e.target as HTMLInputElement).blur();
    }

    return { ...state };
}

function changeLoginInfoProperty(state: State, id: string, name: string, value: string) {
    return {
        ...state,
        logins: {
            ...state.logins,
            [id]: {
                ...state.logins[id],
                info: {
                    ...state.logins[id].info,
                    [name]: value
                },
            }
        }
    };
}

app<State>({
    init: () => ({
        state: 'password',
        username: '',
        password: '',
        key: null,
        feedKeyPair: null,
        message: null,
        logins: {},
        nextLoginID: 0,
        persisting: false
    }),
    view: state => {
        let message;
        if(state.message !== null) {
            message = h('div', {}, state.message);
        }

        let content;
        if(state.state === 'password') {
            content = h('form', {
                id: 'passwordForm',
                onSubmit: (state: State, e: Event) => {
                    e.preventDefault();
                    return submitPassword(state);
                }
            }, [
                h('input', {
                    id: 'username',
                    type: 'text',
                    placeholder: 'username',
                    autoFocus: '',
                    value: state.username,
                    onInput: (state: State, e: Event) => ({ ...state, username: (e.target as HTMLInputElement).value })
                }),
                h('input', {
                    id: 'password',
                    type: 'password',
                    placeholder: 'password',
                    value: state.password,
                    onInput: (state: State, e: Event) => ({ ...state, password: (e.target as HTMLInputElement).value })
                }),
                h('input', {
                    type: 'submit', value: 'Continue'
                })
            ]);
        } else if(state.state === 'logins') {
            const logins = Object.entries(state.logins).map(([id, { info, isPasswordVisible }]) => {
                let passwordInputType;
                let visibilityButtonText;

                if(isPasswordVisible) {
                    passwordInputType = 'text';
                    visibilityButtonText = 'Hide Password';
                } else {
                    passwordInputType = 'password';
                    visibilityButtonText = 'Show Password';
                }

                return h('div', { className: 'loginDisplay' }, [
                    h('input', {
                        type: 'text',
                        value: info.name,
                        placeholder: 'name',
                        onInput: (state: State, e: Event) => changeLoginInfoProperty(state, id, 'name', (e.target as HTMLInputElement).value),
                        onBlur: persistLogins,
                        onKeyDown: onLoginInputKeyDown
                    }),
                    h('input', {
                        type: 'text',
                        value: info.username,
                        placeholder: 'username',
                        onInput: (state: State, e: Event) => changeLoginInfoProperty(state, id, 'username', (e.target as HTMLInputElement).value),
                        onBlur: persistLogins,
                        onKeyDown: onLoginInputKeyDown
                    }),
                    h('input', {
                        type: passwordInputType,
                        value: info.password,
                        placeholder: 'password',
                        onInput: (state: State, e: Event) => changeLoginInfoProperty(state, id, 'password', (e.target as HTMLInputElement).value),
                        onBlur: persistLogins,
                        onKeyDown: onLoginInputKeyDown
                    }),
                    h('input', {
                        type: 'button',
                        onClick: () => ({ ...state, logins: { ...state.logins, [id]: { ...state.logins[id], isPasswordVisible: !isPasswordVisible } } }),
                        value: visibilityButtonText
                    }),
                    h('input', {
                        type: 'button',
                        value: 'Delete',
                        onClick: (state: State) => ({ ...state, logins: Object.fromEntries(Object.entries(state.logins).filter(([key]) => key !== id)) })
                    })
                ]);
            });

            content = [
                ...logins,
                h('input', { type: 'button', value: 'New Login', id: 'newLogin', onClick: addNewLogin})
            ];
        }

        return h('div', { id: 'app'}, [
            content,
            message
        ]);
    },
    node: document.getElementById('root') as Node
});