import React, { Component, ChangeEvent } from 'react';
import nacl from 'tweetnacl';
import scryptsy from 'scryptsy';
import { Buffer } from 'buffer';
import './App.css';
import LoginDisplay from './LoginDisplay';

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
    password: string,
    key: Buffer | null,
    error: string | null,
    logins: { [id: string]: LoginInfo },
    nextLoginID: number
}> {
    constructor(props: {}) {
        super(props);

        this.state = {
            state: 'password',
            password: '',
            key: null,
            error: null,
            logins: {},
            nextLoginID: 0
        };
    }

    passwordChanged(e: ChangeEvent<HTMLInputElement>) {
        this.setState({
            password: e.target.value
        });
    }

    submitPassword() {
        this.setState({
            error: ''
        });

        if(this.state.password.length === 0) {
            this.setState({
                error: 'Please enter a password'
            });
        } else {
            const persistedSaltText = localStorage.getItem('passwordSalt');

            let salt: Buffer;
            if(persistedSaltText === null) {
                salt = Buffer.from(nacl.randomBytes(32));

                localStorage.setItem('passwordSalt', salt.toString('base64'));
            } else {
                salt = Buffer.from(persistedSaltText, 'base64');
            }

            const key = scryptsy(
                Buffer.from(this.state.password),
                salt,
                2048,
                8,
                1,
                nacl.secretbox.keyLength
            );

            const persistedDataJSON = localStorage.getItem('data');

            if(persistedDataJSON !== null) {
                const persistedData: {
                    nonce: string,
                    info: string
                } = JSON.parse(persistedDataJSON);

                const infoJSON = nacl.secretbox.open(new Uint8Array(Buffer.from(persistedData.info, 'base64').buffer), new Uint8Array(Buffer.from(persistedData.nonce, 'base64').buffer), new Uint8Array(key.buffer));

                if(infoJSON !== null) {
                    const info: PersistedInfo = JSON.parse(Buffer.from(infoJSON).toString('utf8'));

                    this.setState({
                        state: 'logins',
                        key,
                        logins: info.logins,
                        nextLoginID: info.nextLoginID
                    });
                } else {
                    this.setState({
                        error: 'Incorrect password'
                    });
                }
            } else {
                this.setState({
                    key,
                    state: 'logins'
                });
            }
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

    persistLogins() {
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

        localStorage.setItem('data', JSON.stringify(persistedData));
    }

    render() {
        let content;
        if(this.state.state === 'password') {
            let error;
            if(this.state.error !== null) {
                error = <div id='error'>{this.state.error}</div>;
            }

            content = <>
                <input id='password' type='password' placeholder='password' onChange={(e) => this.passwordChanged(e)} />
                <input type='button' value='Continue' onClick={() => this.submitPassword()} />
                {error}
            </>;
        } else if(this.state.state === 'logins') {
            const logins = Object.entries(this.state.logins).map(([id, info]) => 
                <LoginDisplay key={id} info={info} onChange={(info) => this.updateLogin(id, info)} onDelete={() => this.deleteLogin(id)} />
            );

            content = <>
                {logins}
                <input type='button' value='New Login' onClick={() => this.addNewLogin()} />
            </>;
        }

        return <div id='App'>
            {content}
        </div>;
    }
}

export default App;