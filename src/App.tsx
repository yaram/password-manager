import React, { Component, ChangeEvent, FormEvent } from 'react';
import nacl from 'tweetnacl';
import scryptsy from 'scryptsy';
import { keccak256 } from 'js-sha3';
import { ec } from 'elliptic';
import { Buffer } from 'buffer';
import * as url from 'url';
import './App.css';
import LoginDisplay from './LoginDisplay';

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

class App extends Component<{}, {
    state: 'password' | 'logins',
    username: string,
    password: string,
    key: Buffer | null,
    feedKeyPair: ec.KeyPair | null,
    error: string | null,
    logins: { [id: string]: LoginInfo },
    nextLoginID: number
}> {
    constructor(props: {}) {
        super(props);

        this.state = {
            state: 'password',
            username: '',
            password: '',
            key: null,
            feedKeyPair: null,
            error: null,
            logins: {},
            nextLoginID: 0
        };
    }

    usernameChanged(e: ChangeEvent<HTMLInputElement>) {
        this.setState({
            username: e.target.value
        });
    }

    passwordChanged(e: ChangeEvent<HTMLInputElement>) {
        this.setState({
            password: e.target.value
        });
    }

    async submitPassword(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if(this.state.username.length === 0) {
            this.setState({
                error: 'Please enter a username'
            });

            return;
        }

        if(this.state.password.length === 0) {
            this.setState({
                error: 'Please enter a password'
            });

            return;
        }

        this.setState({
            error: ''
        });

        const key = scryptsy(
            Buffer.from(this.state.password),
            Buffer.from(this.state.username + '@password-manager'),
            2048,
            8,
            1,
            nacl.secretbox.keyLength
        );

        this.setState({
            key
        });

        let persistedDataJSON: string | null = null;

        try {
            const feedKeyPair = curve.keyFromPrivate(key);

            const feedPublicKey = keccak256.arrayBuffer(feedKeyPair.getPublic().encode().slice(1)).slice(-20);

            this.setState({
                feedKeyPair
            });

            const user = '0x' + Buffer.from(feedPublicKey).toString('hex');

            const topicBytes = Buffer.alloc(32);

            topicBytes.write(feedTopic);

            const topic = '0x' + topicBytes.toString('hex');

            const feedUpdateResponse = await fetch(url.resolve(bzzUrl, '/bzz-feed:/') + '?user=' + user + '&topic=' + topic);

            if(feedUpdateResponse.ok) {
                console.log(await feedUpdateResponse.text());
            }
        } catch(e) {
            
        }

        if(persistedDataJSON === null) {
            persistedDataJSON = localStorage.getItem('data-' + this.state.username);
        }

        if(persistedDataJSON !== null){
            const persistedData: {
                info: string,
                nonce: string
            } = JSON.parse(persistedDataJSON);

            const infoJSON = nacl.secretbox.open(new Uint8Array(Buffer.from(persistedData.info, 'base64').buffer), new Uint8Array(Buffer.from(persistedData.nonce, 'base64').buffer), new Uint8Array(key.buffer));

            if(infoJSON !== null) {
                const info: PersistedInfo = JSON.parse(Buffer.from(infoJSON).toString('utf8'));

                this.setState({
                    state: 'logins',
                    logins: info.logins,
                    nextLoginID: info.nextLoginID
                });
            } else {
                this.setState({
                    error: 'Incorrect username or password'
                });
            }
        } else {
            this.setState({
                state: 'logins'
            });
        }
    }

    updateLogin(id: string, info: LoginInfo) {
        this.setState({
            logins: { ...this.state.logins, [id]: info }
        }, () => this.persistLogins());
    }

    deleteLogin(id: string) {
        const logins = { ...this.state.logins };

        delete logins[id];

        this.setState({
            logins
        });
    }

    addNewLogin() {
        const id = this.state.nextLoginID.toString();

        this.setState({
            logins: { ...this.state.logins, [id]: { name: '', username: '', password: '' } },
            nextLoginID: this.state.nextLoginID + 1
        }, () => this.persistLogins());
    }

    async persistLogins() {
        const info: PersistedInfo = {
            logins: this.state.logins,
            nextLoginID: this.state.nextLoginID
        };

        const infoJSON = JSON.stringify(info);

        const nonce = new Buffer(nacl.randomBytes(nacl.secretbox.nonceLength));

        const infoEncrypted = Buffer.from(nacl.secretbox(new Uint8Array(Buffer.from(infoJSON).buffer), new Uint8Array(nonce.buffer), new Uint8Array((this.state.key as Buffer).buffer)));

        const persistedData = {
            nonce: nonce.toString('base64'),
            info: infoEncrypted.toString('base64')
        };

        const persistedDataJSON = JSON.stringify(persistedData);

        localStorage.setItem('data-' + this.state.username, persistedDataJSON);

        try {
            const feedKeyPair = this.state.feedKeyPair as ec.KeyPair;

            const feedPublicKey = keccak256.arrayBuffer(feedKeyPair.getPublic().encode().slice(1)).slice(-20);

            const user = '0x' + Buffer.from(feedPublicKey).toString('hex');

            const topicBytes = Buffer.alloc(32);

            topicBytes.write(feedTopic);

            const topic = '0x' + topicBytes.toString('hex');

            const feedTemplateResponse = await fetch(url.resolve(bzzUrl, '/bzz-feed:/') + '?user=' + user + '&topic' + topic + '&meta=1');

            const feedTemplate: {
                feed: {
                    topic: string,
                    user: string
                },
                epoch: {
                    level: number,
                    time: number
                },
                protocolVersion: number
            } = await feedTemplateResponse.json();

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

            await fetch(url.resolve(bzzUrl, '/bzz-feed:/') + '?topic=' + topic + '&user=' + user + '&level=' + feedTemplate.epoch.level + '&time=' + feedTemplate.epoch.time + '&signature=0x' + signature.toString('hex'), {
                method: 'POST',
                body: persistedDataJSON
            });
        } catch(e) {

        }
    }

    render() {
        let content;
        if(this.state.state === 'password') {
            let error;
            if(this.state.error !== null) {
                error = <div id='error'>{this.state.error}</div>;
            }

            content = <form id='passwordForm' onSubmit={(e) => this.submitPassword(e)}>
                <input id='username' type='text' placeholder='username' autoFocus onChange={(e) => this.usernameChanged(e)} />
                <input id='password' type='password' placeholder='password' onChange={(e) => this.passwordChanged(e)} />
                <input type='submit' value='Continue' />
                
                {error}
            </form>;
        } else if(this.state.state === 'logins') {
            const logins = Object.entries(this.state.logins).map(([id, info]) => 
                <LoginDisplay key={id} info={info} onChange={(info) => this.updateLogin(id, info)} onDelete={() => this.deleteLogin(id)} />
            );

            content = <>
                {logins}
                <input type='button' value='New Login' id='newLogin' onClick={() => this.addNewLogin()} />
            </>;
        }

        return <div id='App'>
            {content}
        </div>;
    }
}

export default App;